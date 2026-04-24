// Profile page — per-user daily streak, stats, and recent history.
//
// Required Supabase migration. Run this in the SQL editor:
//
//   ALTER TABLE public.daily_scores ADD COLUMN IF NOT EXISTS user_id uuid references auth.users(id);
//   CREATE INDEX IF NOT EXISTS daily_scores_user_id_idx ON public.daily_scores (user_id);
//
// Note: the existing "public insert" RLS policy still allows any signed-in
// user to submit a row with any user_id (or no user_id). If you want to
// enforce "user_id must match auth.uid() when non-null", replace the
// existing public-insert policy with:
//
//   DROP POLICY IF EXISTS "public insert" ON public.daily_scores;
//   CREATE POLICY "insert with valid user" ON public.daily_scores FOR INSERT
//     TO anon, authenticated
//     WITH CHECK (user_id IS NULL OR user_id = auth.uid());
//
// Kept permissive for now so the existing anonymous-submission flow keeps
// working unchanged.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import { addDays, getTodayLondon } from "@/lib/dates";
import SoloBest from "./SoloBest";
import SignOutButton from "./SignOutButton";

export const dynamic = "force-dynamic";

type ScoreRow = {
  snapshot_date: string;
  score: number;
  player_name: string;
  created_at: string;
};

const MONTHS_SHORT = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

function formatDateLabel(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

type Band = "green" | "amber" | "red";

function scoreBand(score: number): Band {
  if (score < 100) return "green";
  if (score < 200) return "amber";
  return "red";
}

function bandDot(b: Band): string {
  return b === "green" ? "bg-spotify" : b === "amber" ? "bg-amber" : "bg-red";
}

function bandText(b: Band): string {
  return b === "green" ? "text-spotify" : b === "amber" ? "text-amber" : "text-red";
}

function bandLabel(b: Band): string {
  return b === "green" ? "Strong" : b === "amber" ? "OK" : "Rough";
}

// Deduplicate by snapshot_date, keeping the first (most recent) occurrence.
// Input must already be sorted by (snapshot_date desc, created_at desc).
function dedupeByDate(rows: ScoreRow[]): ScoreRow[] {
  const seen = new Set<string>();
  const out: ScoreRow[] = [];
  for (const r of rows) {
    if (seen.has(r.snapshot_date)) continue;
    seen.add(r.snapshot_date);
    out.push(r);
  }
  return out;
}

function computeStreaks(
  uniqueRows: ScoreRow[],
  todayLondon: string,
): { current: number; longest: number } {
  if (uniqueRows.length === 0) return { current: 0, longest: 0 };
  // Rows are already unique-per-date and sorted desc. Pull just the dates.
  const dates = uniqueRows.map((r) => r.snapshot_date);

  // Current streak: only alive if most recent play is today or yesterday
  // (London). If older than yesterday, the run has been broken — 0.
  const yesterday = addDays(todayLondon, -1);
  let current = 0;
  if (dates[0] === todayLondon || dates[0] === yesterday) {
    current = 1;
    let prev = dates[0];
    for (let i = 1; i < dates.length; i++) {
      if (dates[i] === addDays(prev, -1)) {
        current++;
        prev = dates[i];
      } else {
        break;
      }
    }
  }

  // Longest streak: walk all dates, tracking the max consecutive run.
  let longest = 0;
  let run = 1;
  for (let i = 1; i < dates.length; i++) {
    if (dates[i] === addDays(dates[i - 1], -1)) {
      run++;
    } else {
      longest = Math.max(longest, run);
      run = 1;
    }
  }
  longest = Math.max(longest, run);

  return { current, longest };
}

function computeStats(uniqueRows: ScoreRow[]): {
  count: number;
  avg: number | null;
  best: number | null;
} {
  if (uniqueRows.length === 0) return { count: 0, avg: null, best: null };
  const total = uniqueRows.reduce((s, r) => s + r.score, 0);
  return {
    count: uniqueRows.length,
    avg: total / uniqueRows.length,
    best: Math.min(...uniqueRows.map((r) => r.score)),
  };
}

export default async function ProfilePage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/signin?next=/profile");
  }

  const { data: rawRows, error } = await supabase
    .from("daily_scores")
    .select("snapshot_date, score, player_name, created_at")
    .eq("user_id", user.id)
    .order("snapshot_date", { ascending: false })
    .order("created_at", { ascending: false });

  const rows = dedupeByDate((rawRows ?? []) as ScoreRow[]);
  const streaks = computeStreaks(rows, getTodayLondon());
  const stats = computeStats(rows);
  const recent = rows.slice(0, 10);
  const username = user.email?.split("@")[0] ?? "Player";
  const initial = (username[0] ?? "?").toUpperCase();

  return (
    <main className="flex-1 px-5 sm:px-10 pt-32 pb-16">
      <div className="w-full max-w-3xl mx-auto">
        {/* Header */}
        <header className="flex items-start justify-between gap-4 mb-10">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-full bg-spotify text-background flex items-center justify-center font-display text-2xl sm:text-3xl">
              {initial}
            </div>
            <div className="min-w-0">
              <div
                className="font-display tracking-[2px] text-foreground leading-none truncate"
                style={{ fontSize: "clamp(28px, 5vw, 44px)" }}
              >
                {username}
              </div>
              <div className="mt-2 font-mono text-[11px] tracking-[1px] text-muted break-all">
                {user.email}
              </div>
            </div>
          </div>
          <SignOutButton />
        </header>

        {error && (
          <div className="bg-surface border border-border rounded-lg p-5 mb-6 font-mono text-[11px] tracking-[1px] uppercase text-red">
            Couldn&rsquo;t load your scores: {error.message}
          </div>
        )}

        {/* ==================================================
            DAILY CHALLENGE
            ================================================== */}
        <SectionHeading title="DAILY CHALLENGE" />

        {/* Streak — full width so the flame number reads as the hero stat
            for this section. Longest sits inside as secondary context. */}
        <div className="bg-surface border border-border rounded-lg p-6 flex flex-col">
          <div className="font-mono text-[11px] tracking-[3px] uppercase text-muted mb-3">
            Current streak
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl sm:text-4xl leading-none" aria-hidden>
              🔥
            </span>
            <span
              className="font-display leading-none text-spotify tabular-nums"
              style={{ fontSize: "clamp(56px, 9vw, 88px)" }}
            >
              {streaks.current}
            </span>
          </div>
          <div className="mt-auto pt-3 font-mono text-[10px] tracking-[2px] uppercase text-muted">
            Longest: {streaks.longest}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
          <StatCard
            label="Plays"
            value={stats.count > 0 ? stats.count.toLocaleString() : "—"}
          />
          <StatCard
            label="Average score"
            value={stats.avg !== null ? Math.round(stats.avg).toLocaleString() : "—"}
          />
          <StatCard
            label="Best score"
            value={stats.best !== null ? stats.best.toLocaleString() : "—"}
            hint="Lower is better"
          />
          <StatCard label="Best rank" value="—" hint="Coming soon" />
        </div>

        <div className="mt-8">
          <div className="font-mono text-[11px] tracking-[3px] uppercase text-spotify mb-5 flex items-center gap-[10px]">
            <span className="w-6 h-px bg-spotify" />
            Recent plays
          </div>
          {recent.length === 0 ? (
            <div className="bg-surface border border-border rounded-lg p-5 font-mono text-[11px] tracking-[2px] uppercase text-muted">
              No daily challenges played yet —{" "}
              <Link href="/daily" className="text-spotify hover:underline normal-case tracking-normal">
                try today&rsquo;s
              </Link>
              .
            </div>
          ) : (
            <ol className="bg-surface border border-border rounded-lg overflow-hidden">
              {recent.map((r, i) => {
                const b = scoreBand(r.score);
                return (
                  <li
                    key={`${r.snapshot_date}-${i}`}
                    className="flex items-center gap-4 px-5 py-3 border-b border-border/60 last:border-b-0"
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${bandDot(b)} shrink-0`}
                      aria-hidden
                    />
                    <span className="font-mono text-[11px] tracking-[1px] uppercase text-muted w-20 shrink-0">
                      {formatDateLabel(r.snapshot_date)}
                    </span>
                    <span
                      className={`flex-1 font-mono text-[14px] tabular-nums ${bandText(b)}`}
                    >
                      {r.score}
                    </span>
                    <span className="font-mono text-[10px] tracking-[2px] uppercase text-muted shrink-0">
                      {bandLabel(b)}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* ==================================================
            SOLO PLAY
            ================================================== */}
        <SectionHeading title="SOLO PLAY" className="mt-14" />

        <SoloBest />
      </div>
    </main>
  );
}

function SectionHeading({
  title,
  className = "mb-6",
}: {
  title: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <span aria-hidden className="block w-10 h-px bg-spotify shrink-0" />
      <h2
        className="font-display tracking-[2px] leading-none text-foreground"
        style={{ fontSize: "clamp(32px, 5vw, 56px)" }}
      >
        {title}
      </h2>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-lg p-5">
      <div className="font-mono text-[10px] tracking-[2px] uppercase text-muted">
        {label}
      </div>
      <div className="mt-2 font-display text-3xl sm:text-4xl tabular-nums leading-none">
        {value}
      </div>
      {hint && (
        <div className="mt-2 font-mono text-[9px] tracking-[1px] uppercase text-muted">
          {hint}
        </div>
      )}
    </div>
  );
}
