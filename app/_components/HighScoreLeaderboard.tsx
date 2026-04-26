"use client";

// Shared higher-is-better leaderboard used by Solo Play and Higher or
// Lower results screens. Two tabs: ALL TIME and TODAY. Highlights the
// current player's row if they land in the top 10; otherwise appends a
// "your rank" divider + row at the bottom, matching the pattern from
// the daily-challenge leaderboard.
//
// This intentionally doesn't try to unify with the daily leaderboard,
// which is lower-is-better and keyed on snapshot_date rather than a
// raw created_at cutoff.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getTodayLondon, londonDayStartUTC } from "@/lib/dates";

type Row = {
  player_name: string;
  metric: number;
  created_at: string;
};

type Tab = "all" | "today";

const TOP_LIMIT = 10;
// Over-fetch so client-side MAX-per-name dedupe still produces 10
// distinct names. Submits now insert a row per game, so a single
// dominant player can take many of the top raw rows; we want enough
// headroom that we don't run out of distinct names. Tuned for a few
// hundred submissions per day; raise if dedupe regularly truncates.
const OVER_FETCH = 100;
const POLL_MS = 30_000;

// Collapses duplicate player_names to one row each, keeping the best
// metric (higher-is-better in this component). Input should already be
// sorted best-first, which makes the first occurrence per name the one
// to keep. Case-insensitive match so "jack" and "Jack" collapse.
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

    // Diagnostic log — surfaces the actual cutoff being applied so we
    // can compare against rows in the DB. Cheap to keep around; if it
    // becomes noise later, gate behind a debug flag.
    console.log(`[leaderboard:${table}] fetch`, {
      now: new Date().toISOString(),
      today,
      todayStartISO,
    });

    const topAll = supabase
      .from(table)
      .select(`player_name, ${metricColumn}, created_at`)
      .order(metricColumn, { ascending: false })
      .order("created_at", { ascending: true }) // ties: earliest wins
      .limit(OVER_FETCH);
    // Today fetch: filter BEFORE order/limit so PostgREST applies the
    // WHERE clause first. Same query as topAll but scoped to rows
    // created on or after the current London day's start.
    const topToday = supabase
      .from(table)
      .select(`player_name, ${metricColumn}, created_at`)
      .gte("created_at", todayStartISO)
      .order(metricColumn, { ascending: false })
      .order("created_at", { ascending: true })
      .limit(OVER_FETCH);

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

    const allNormalised = normalise((a.data ?? []) as unknown[]);
    const todayNormalised = normalise((t.data ?? []) as unknown[]);

    console.log(`[leaderboard:${table}] today result`, {
      cutoff: todayStartISO,
      rawRowCount: todayNormalised.length,
      firstRow: todayNormalised[0],
      lastRow: todayNormalised[todayNormalised.length - 1],
    });

    // Dedupe runs on each result set independently. The today list
    // never sees yesterday's rows because they're filtered out at the
    // query level — dedupeByName here only collapses today's MAX.
    setAllRows(dedupeByName(allNormalised));
    setTodayRows(dedupeByName(todayNormalised));
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
            key={`${row.created_at}-${i}`}
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
