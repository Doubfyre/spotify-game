"use client";

// Shared higher-is-better leaderboard used by Solo Play and Higher or
// Lower results screens. Two tabs: ALL TIME and TODAY.
//
// All-time queries hit Postgres views that pre-aggregate MAX/MIN per
// player_name, so a single dominant player can't crowd out distinct
// names. Today queries still hit the raw tables and dedupe in the
// client because the views aren't date-scoped.
//
// ---------------------------------------------------------------------
// One-time migration. Run this in the Supabase SQL editor:
//
//   create or replace view public.solo_scores_best as
//   select player_name, max(score) as score, min(created_at) as first_at
//   from public.solo_scores
//   group by player_name;
//
//   create or replace view public.higher_lower_scores_best as
//   select player_name, max(streak) as streak, min(created_at) as first_at
//   from public.higher_lower_scores
//   group by player_name;
//
//   create or replace view public.daily_scores_best as
//   select player_name, min(score) as score, min(created_at) as first_at
//   from public.daily_scores
//   group by player_name;
//
//   grant select on public.solo_scores_best         to anon, authenticated;
//   grant select on public.higher_lower_scores_best to anon, authenticated;
//   grant select on public.daily_scores_best        to anon, authenticated;

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getTodayLondon, londonDayStartUTC } from "@/lib/dates";

type Row = {
  player_name: string;
  metric: number;
  // Empty string when the row came from an aggregated view — we don't
  // surface created_at for all-time entries (no useful "when").
  created_at: string;
};

type Tab = "all" | "today";

const TOP_LIMIT = 10;
// Over-fetch budget for the today list only. The all-time list reads
// from the *_best views which are already deduped server-side, so it
// fetches exactly TOP_LIMIT. Today still over-fetches because we
// dedupe in the client (views aren't date-scoped).
const TODAY_OVER_FETCH = 20;
const POLL_MS = 30_000;

// Collapses duplicate player_names to one row each, keeping the best
// metric (higher-is-better in this component). Used only for today's
// list now — all-time is server-side aggregated.
function dedupeByName(rows: Row[]): Row[] {
  const best = new Map<string, Row>();
  for (const r of rows) {
    const key = r.player_name.toLowerCase();
    const prev = best.get(key);
    if (!prev || r.metric > prev.metric) best.set(key, r);
  }
  return Array.from(best.values()).slice(0, TOP_LIMIT);
}

export default function HighScoreLeaderboard({
  table,
  metricColumn,
  metricLabel,
  player,
}: {
  table: "solo_scores" | "higher_lower_scores";
  metricColumn: "score" | "streak";
  metricLabel: string;
  // Just the display name the current player submitted under. The
  // leaderboard rows show MAX-per-name, so the metric on the player's
  // row may be a previous, better submission — we match by name only.
  // Null for viewers who didn't submit (anon, skipped).
  player: { name: string } | null;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [allRows, setAllRows] = useState<Row[] | null>(null);
  const [todayRows, setTodayRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    // Recompute the London-midnight cutoff every poll. Caching it via
    // useMemo([]) caused yesterday's rows to leak into "today" once the
    // tab sat across midnight — and then dedupeByName picked the higher
    // metric, hiding today's actual run behind an older record.
    const today = getTodayLondon();
    const todayStartISO = londonDayStartUTC(today);

    // All-time: query the view (one row per player_name, MAX metric).
    // No over-fetch, no client-side dedupe — Postgres has done both.
    const topAll = supabase
      .from(`${table}_best`)
      .select(`player_name, ${metricColumn}`)
      .order(metricColumn, { ascending: false })
      .order("player_name", { ascending: true }) // stable secondary
      .limit(TOP_LIMIT);
    // Today: raw rows + client dedupe. The view isn't date-scoped, so
    // we still need the today list to read recent rows directly. Over-
    // fetch is small because today's volume is bounded.
    const topToday = supabase
      .from(table)
      .select(`player_name, ${metricColumn}, created_at`)
      .gte("created_at", todayStartISO)
      .order(metricColumn, { ascending: false })
      .order("created_at", { ascending: true })
      .limit(TODAY_OVER_FETCH);

    const [a, t] = await Promise.all([topAll, topToday]);

    const firstErr = a.error?.message ?? t.error?.message ?? null;
    if (firstErr) {
      setErr(firstErr);
      return;
    }
    setErr(null);

    const normalise = (rows: unknown[]): Row[] =>
      (rows as Array<Record<string, unknown>>).map((r) => ({
        player_name: String(r.player_name ?? ""),
        metric: Number(r[metricColumn] ?? 0),
        created_at: String(r.created_at ?? ""),
      }));

    setAllRows(normalise((a.data ?? []) as unknown[]));
    setTodayRows(dedupeByName(normalise((t.data ?? []) as unknown[])));
  }, [table, metricColumn]);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, POLL_MS);
    return () => clearInterval(id);
  }, [fetchAll]);

  const activeRows = tab === "all" ? allRows : todayRows;

  return (
    <section className="mt-12">
      <div className="font-mono text-[11px] tracking-[3px] uppercase text-spotify mb-5 flex items-center gap-[10px]">
        <span className="w-6 h-px bg-spotify" />
        Leaderboard
      </div>

      <div className="flex gap-2 mb-4">
        <TabButton active={tab === "all"} onClick={() => setTab("all")}>
          All time
        </TabButton>
        <TabButton active={tab === "today"} onClick={() => setTab("today")}>
          Today
        </TabButton>
      </div>

      <Body rows={activeRows} err={err} player={player} />
    </section>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`font-mono text-[11px] tracking-[2px] uppercase px-4 py-2 rounded-[4px] border transition ${
        active
          ? "border-spotify text-spotify bg-spotify/10"
          : "border-border text-muted hover:text-foreground hover:border-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Body({
  rows,
  err,
  player,
}: {
  rows: Row[] | null;
  err: string | null;
  player: { name: string } | null;
}) {
  if (err) {
    return (
      <div className="bg-surface border border-border rounded-lg p-5 font-mono text-[11px] tracking-[1px] uppercase text-red">
        Couldn&rsquo;t load leaderboard: {err}
      </div>
    );
  }
  if (rows === null) {
    return (
      <div className="bg-surface border border-border rounded-lg p-5 font-mono text-[11px] tracking-[2px] uppercase text-muted">
        Loading…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-lg p-5 font-mono text-[11px] tracking-[2px] uppercase text-muted">
        No scores yet — be the first.
      </div>
    );
  }

  // Match by name only. After always-INSERT + MAX-per-name dedupe, the
  // row that represents this player on the board may carry a higher
  // metric than the run they just submitted. Two anonymous players with
  // the same name collapse to one displayed row anyway, so highlighting
  // by name aligns with what the leaderboard actually shows.
  const mineInList = (row: Row) =>
    player !== null &&
    row.player_name.toLowerCase() === player.name.toLowerCase();

  return (
    <ol className="bg-surface border border-border rounded-lg overflow-hidden">
      {rows.map((row, i) => {
        const mine = mineInList(row);
        return (
          <li
            key={`${row.player_name}-${i}`}
            className={`flex items-center gap-4 px-5 py-3 border-b border-border/60 last:border-b-0 ${mine ? "bg-spotify/5" : ""}`}
          >
            <span
              className={`font-display text-[20px] leading-none w-10 shrink-0 ${i === 0 ? "text-spotify" : "text-muted"}`}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span
              className={`flex-1 truncate ${mine ? "text-spotify font-medium" : "text-foreground"}`}
            >
              {row.player_name}
            </span>
            <span className="font-mono text-[13px] text-muted tabular-nums">
              {row.metric.toLocaleString()}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
