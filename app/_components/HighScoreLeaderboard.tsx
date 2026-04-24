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

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getTodayLondon, londonDayStartUTC } from "@/lib/dates";

type Row = {
  player_name: string;
  metric: number;
  created_at: string;
};

type Tab = "all" | "today";

const TOP_LIMIT = 10;
// Over-fetch so that after collapsing duplicate player_names we still
// have enough distinct rows to fill the top 10. Logged-in rows are
// unique per user via the DB partial index; this covers anon submits.
const OVER_FETCH = TOP_LIMIT * 4;
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
  // The row the current player just submitted, if they're signed in and
  // the save succeeded. Null for anon viewers or if the save failed.
  player: { name: string; metric: number } | null;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [allRows, setAllRows] = useState<Row[] | null>(null);
  const [todayRows, setTodayRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [allRank, setAllRank] = useState<number | null>(null);
  const [todayRank, setTodayRank] = useState<number | null>(null);

  const todayStartISO = useMemo(
    () => londonDayStartUTC(getTodayLondon()),
    [],
  );

  const fetchAll = useCallback(async () => {
    // Run the four queries in parallel — top 10 + optional rank, for
    // each of the two tabs. Rank lookups are skipped when there's no
    // player row to rank (anon viewer).
    const topAll = supabase
      .from(table)
      .select(`player_name, ${metricColumn}, created_at`)
      .order(metricColumn, { ascending: false })
      .order("created_at", { ascending: true }) // ties: earliest wins
      .limit(OVER_FETCH);
    const topToday = supabase
      .from(table)
      .select(`player_name, ${metricColumn}, created_at`)
      .gte("created_at", todayStartISO)
      .order(metricColumn, { ascending: false })
      .order("created_at", { ascending: true })
      .limit(OVER_FETCH);
    const rankAll = player
      ? supabase
          .from(table)
          .select("*", { count: "exact", head: true })
          .gt(metricColumn, player.metric)
      : Promise.resolve({ count: null, error: null });
    const rankToday = player
      ? supabase
          .from(table)
          .select("*", { count: "exact", head: true })
          .gte("created_at", todayStartISO)
          .gt(metricColumn, player.metric)
      : Promise.resolve({ count: null, error: null });

    const [a, t, ra, rt] = await Promise.all([
      topAll,
      topToday,
      rankAll,
      rankToday,
    ]);

    const firstErr =
      a.error?.message ??
      t.error?.message ??
      // Pending supabase-js versions type the count-only result loosely;
      // normalise by optional-chaining the error field.
      (ra as { error?: { message?: string } }).error?.message ??
      (rt as { error?: { message?: string } }).error?.message ??
      null;
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

    setAllRows(dedupeByName(normalise((a.data ?? []) as unknown[])));
    setTodayRows(dedupeByName(normalise((t.data ?? []) as unknown[])));
    const raCount = (ra as { count: number | null }).count;
    const rtCount = (rt as { count: number | null }).count;
    setAllRank(player && raCount !== null ? raCount + 1 : null);
    setTodayRank(player && rtCount !== null ? rtCount + 1 : null);
  }, [table, metricColumn, player, todayStartISO]);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, POLL_MS);
    return () => clearInterval(id);
  }, [fetchAll]);

  const activeRows = tab === "all" ? allRows : todayRows;
  const activeRank = tab === "all" ? allRank : todayRank;

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

      <Body
        rows={activeRows}
        err={err}
        metricLabel={metricLabel}
        player={player}
        playerRank={activeRank}
      />
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
  metricLabel,
  player,
  playerRank,
}: {
  rows: Row[] | null;
  err: string | null;
  metricLabel: string;
  player: { name: string; metric: number } | null;
  playerRank: number | null;
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

  // Highlight rows matching the player by (name, metric). Matches the
  // daily-challenge pattern: same-name strangers with different metrics
  // won't highlight, and the player's own row is always safe to match.
  const mineInList = (row: Row) =>
    player !== null &&
    row.player_name === player.name &&
    row.metric === player.metric;
  const inList = rows.some(mineInList);
  const outsideTop =
    player !== null && playerRank !== null && playerRank > rows.length && !inList;

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

      {outsideTop && player !== null && playerRank !== null && (
        <>
          <li className="flex items-center gap-4 px-5 py-2 border-t border-border bg-background/40 font-mono text-[10px] tracking-[2px] uppercase text-muted">
            <span className="flex-1">Your {metricLabel.toLowerCase()}</span>
          </li>
          <li className="flex items-center gap-4 px-5 py-3 bg-spotify/5">
            <span className="font-display text-[20px] leading-none w-10 shrink-0 text-spotify">
              {playerRank}
            </span>
            <span className="flex-1 truncate text-spotify font-medium">
              {player.name}
            </span>
            <span className="font-mono text-[13px] text-spotify tabular-nums">
              {player.metric.toLocaleString()}
            </span>
          </li>
        </>
      )}
    </ol>
  );
}
