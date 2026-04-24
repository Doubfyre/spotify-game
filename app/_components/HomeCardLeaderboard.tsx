"use client";

// Compact top-5 leaderboard shown inside a ModeCard on the homepage
// when the player taps "LEADERBOARD +". Lazy-loads on first open so the
// homepage render doesn't pay for tables the user never expands.
//
// Three variants:
//   - solo:        solo_scores,         score  desc
//   - daily:       daily_scores,        score  asc  (lower wins)
//   - higherlower: higher_lower_scores, streak desc

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getTodayLondon, londonDayStartUTC } from "@/lib/dates";

export type HomeLeaderboardVariant = "solo" | "daily" | "higherlower";

type Row = { player_name: string; metric: number };

const TOP_LIMIT = 5;
// Over-fetch so there's enough to dedupe by player_name and still show
// a full top 5. Logged-in rows are already unique per user via the DB
// partial index; this covers anonymous submissions.
const OVER_FETCH = 25;

// Per-variant fetch. Returns [allTime, today] or throws on first error.
async function fetchForVariant(
  variant: HomeLeaderboardVariant,
): Promise<{ all: Row[]; today: Row[] }> {
  const snapshot = getTodayLondon();
  const todayStartISO = londonDayStartUTC(snapshot);

  // Each variant has slightly different query params. Keeping them
  // inline avoids a generic "apply this filter" lambda that the
  // supabase-js types don't thread through cleanly.
  if (variant === "solo") {
    const base = () =>
      supabase
        .from("solo_scores")
        .select("player_name, score")
        .order("score", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(OVER_FETCH);
    const [a, t] = await Promise.all([
      base(),
      base().gte("created_at", todayStartISO),
    ]);
    throwIfError(a.error, t.error);
    return {
      all: collapse(normalise(a.data as unknown[], "score"), "desc"),
      today: collapse(normalise(t.data as unknown[], "score"), "desc"),
    };
  }
  if (variant === "higherlower") {
    const base = () =>
      supabase
        .from("higher_lower_scores")
        .select("player_name, streak")
        .order("streak", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(OVER_FETCH);
    const [a, t] = await Promise.all([
      base(),
      base().gte("created_at", todayStartISO),
    ]);
    throwIfError(a.error, t.error);
    return {
      all: collapse(normalise(a.data as unknown[], "streak"), "desc"),
      today: collapse(normalise(t.data as unknown[], "streak"), "desc"),
    };
  }
  // daily
  const base = () =>
    supabase
      .from("daily_scores")
      .select("player_name, score")
      .order("score", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(OVER_FETCH);
  const [a, t] = await Promise.all([
    base(),
    base().eq("snapshot_date", snapshot),
  ]);
  throwIfError(a.error, t.error);
  return {
    all: collapse(normalise(a.data as unknown[], "score"), "asc"),
    today: collapse(normalise(t.data as unknown[], "score"), "asc"),
  };
}

function normalise(rows: unknown[], col: "score" | "streak"): Row[] {
  return (rows as Array<Record<string, unknown>>).map((r) => ({
    player_name: String(r.player_name ?? ""),
    metric: Number(r[col] ?? 0),
  }));
}

// Collapses duplicate player_names to one row each, keeping the best
// metric in the given direction. Input order is preserved among kept
// rows (the first-seen wins on metric ties), then truncated to the
// display limit. Case-insensitive match so "jack" and "Jack" collapse.
function collapse(rows: Row[], direction: "asc" | "desc"): Row[] {
  const best = new Map<string, Row>();
  for (const r of rows) {
    const key = r.player_name.toLowerCase();
    const prev = best.get(key);
    if (!prev) {
      best.set(key, r);
      continue;
    }
    const prevIsBetter =
      direction === "desc" ? prev.metric >= r.metric : prev.metric <= r.metric;
    if (!prevIsBetter) best.set(key, r);
  }
  // Array.from preserves insertion order; input was already sorted so
  // the Map naturally holds the best-per-name in rank order.
  return Array.from(best.values()).slice(0, TOP_LIMIT);
}

function throwIfError(
  ...errs: Array<{ message: string } | null | undefined>
): void {
  for (const e of errs) {
    if (e) throw new Error(e.message);
  }
}

export default function HomeCardLeaderboard({
  variant,
  isOpen,
}: {
  variant: HomeLeaderboardVariant;
  isOpen: boolean;
}) {
  const [allRows, setAllRows] = useState<Row[] | null>(null);
  const [todayRows, setTodayRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Lazy-fetch on first expand. We don't re-fetch on subsequent opens —
  // the homepage already polls other data, and a collapsed mini-board
  // refreshing on every toggle would be noise. Remount to refresh.
  useEffect(() => {
    if (!isOpen || loaded) return;
    setLoaded(true);
    (async () => {
      try {
        const { all, today } = await fetchForVariant(variant);
        setAllRows(all);
        setTodayRows(today);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [variant, isOpen, loaded]);

  if (!isOpen) return null;

  return (
    <div
      className="mt-3 pt-3 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-3 text-left"
      onClick={(e) => e.stopPropagation()}
    >
      <Column title="All time top 5" rows={allRows} err={err} />
      <Column title="Today top 5" rows={todayRows} err={err} />
    </div>
  );
}

function Column({
  title,
  rows,
  err,
}: {
  title: string;
  rows: Row[] | null;
  err: string | null;
}) {
  return (
    <div>
      <div className="font-mono text-[9px] tracking-[2px] uppercase text-muted mb-2">
        {title}
      </div>
      {err ? (
        <div className="font-mono text-[10px] tracking-[1px] uppercase text-red">
          Failed to load
        </div>
      ) : rows === null ? (
        <div className="font-mono text-[10px] tracking-[2px] uppercase text-muted">
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="font-mono text-[10px] tracking-[2px] uppercase text-muted">
          No scores yet
        </div>
      ) : (
        <ol className="space-y-1">
          {rows.map((r, i) => (
            <li
              key={`${r.player_name}-${i}`}
              className="flex items-center gap-2 font-mono text-[11px] tabular-nums"
            >
              <span
                className={`w-4 shrink-0 ${i === 0 ? "text-spotify" : "text-muted"}`}
              >
                {i + 1}
              </span>
              <span className="flex-1 truncate text-foreground">
                {r.player_name}
              </span>
              <span className="text-muted">{r.metric.toLocaleString()}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
