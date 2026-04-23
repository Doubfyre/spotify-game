"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export type ArtistPick = { rank: number; artist_name: string };

type Round = {
  artist: string;
  actual: number;
  guess: number;
  diff: number;
};

type Completed = {
  date: string;
  rounds: Round[];
  total: number;
  submittedAs: string | null;
};

type LeaderboardRow = {
  player_name: string;
  score: number;
  created_at: string;
};

const TOTAL_ROUNDS = 3;

function storageKey(date: string) {
  return `daily-challenge:${date}`;
}

// DD/MM/YY for the share text.
function formatShareDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

function band(diff: number): "green" | "amber" | "red" {
  if (diff < 30) return "green";
  if (diff < 100) return "amber";
  return "red";
}

function bandEmoji(b: ReturnType<typeof band>) {
  return b === "green" ? "🟢" : b === "amber" ? "🟡" : "🔴";
}

function bandClass(b: ReturnType<typeof band>) {
  return b === "green"
    ? "text-spotify"
    : b === "amber"
      ? "text-amber"
      : "text-red";
}

export default function DailyChallenge({
  picks,
  snapshotDate,
}: {
  picks: ArtistPick[];
  snapshotDate: string;
}) {
  const [hydrated, setHydrated] = useState(false);
  const [completed, setCompleted] = useState<Completed | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // On mount: check localStorage for today's completion.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(snapshotDate));
      if (raw) {
        const parsed = JSON.parse(raw) as Completed;
        if (parsed && parsed.date === snapshotDate) {
          setCompleted(parsed);
        }
      }
    } catch {
      // malformed — ignore, user gets a fresh game
    }
    setHydrated(true);
  }, [snapshotDate]);

  function submitGuess() {
    setInputError(null);
    const n = Number(input);
    if (!Number.isInteger(n) || n < 1 || n > 500) {
      setInputError("Enter a whole number between 1 and 500.");
      return;
    }
    const pick = picks[currentIdx];
    const round: Round = {
      artist: pick.artist_name,
      actual: pick.rank,
      guess: n,
      diff: Math.abs(n - pick.rank),
    };
    const nextRounds = [...rounds, round];
    setRounds(nextRounds);
    setInput("");

    if (nextRounds.length >= TOTAL_ROUNDS) {
      const total = nextRounds.reduce((s, r) => s + r.diff, 0);
      const done: Completed = {
        date: snapshotDate,
        rounds: nextRounds,
        total,
        submittedAs: null,
      };
      try {
        localStorage.setItem(storageKey(snapshotDate), JSON.stringify(done));
      } catch {
        // storage may be disabled — fail open, user still sees results
      }
      setCompleted(done);
    } else {
      setCurrentIdx((i) => i + 1);
      // refocus next tick
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submitGuess();
    }
  }

  const markSubmitted = useCallback(
    (name: string) => {
      setCompleted((prev) => {
        if (!prev) return prev;
        const next = { ...prev, submittedAs: name };
        try {
          localStorage.setItem(storageKey(snapshotDate), JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [snapshotDate],
  );

  if (!hydrated) {
    return <LoadingState snapshotDate={snapshotDate} />;
  }

  if (completed) {
    return (
      <Results
        completed={completed}
        snapshotDate={snapshotDate}
        onSubmitted={markSubmitted}
      />
    );
  }

  const currentPick = picks[currentIdx];

  return (
    <main className="flex-1 flex flex-col px-5 sm:px-10 pt-32 pb-16">
      <div className="w-full max-w-3xl mx-auto">
        <TopBar snapshotDate={snapshotDate} />

        <div className="mt-10 flex items-start justify-between gap-6">
          <div>
            <div className="font-mono text-[11px] tracking-[3px] uppercase text-spotify mb-3 flex items-center gap-[10px]">
              <span className="w-6 h-px bg-spotify" />
              Artist {currentIdx + 1} / {TOTAL_ROUNDS}
            </div>
            <h1
              className="font-display leading-none tracking-[2px] text-foreground"
              style={{ fontSize: "clamp(48px, 9vw, 96px)" }}
            >
              {currentPick.artist_name.toUpperCase()}
            </h1>
            <p className="text-muted mt-4 font-light max-w-md">
              Guess their rank in today&rsquo;s Spotify top 500. Closer = lower
              score. Lowest total wins.
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono text-[11px] tracking-[3px] uppercase text-muted mb-2">
              Running
            </div>
            <div className="font-display text-5xl sm:text-6xl leading-none text-foreground">
              {rounds.reduce((s, r) => s + r.diff, 0)}
            </div>
          </div>
        </div>

        <div className="mt-10 flex items-center gap-3 max-w-md">
          <input
            ref={inputRef}
            type="number"
            inputMode="numeric"
            min={1}
            max={500}
            autoFocus
            aria-label="Your rank guess"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="1–500"
            className="focus-green w-40 rounded-[4px] bg-surface border border-border px-4 py-3 font-mono text-lg text-center tracking-[2px] text-foreground placeholder:text-muted/60 transition"
          />
          <button
            type="button"
            onClick={submitGuess}
            className="bg-spotify text-background font-bold text-[14px] tracking-[0.5px] px-6 py-3 rounded-[4px] transition hover:-translate-y-px hover:bg-spotify-bright"
          >
            Submit →
          </button>
        </div>
        {inputError && (
          <div className="font-mono text-[11px] tracking-[1px] uppercase text-red mt-3">
            {inputError}
          </div>
        )}
        {!inputError && (
          <div className="font-mono text-[10px] tracking-[2px] uppercase text-muted mt-3">
            Press Enter to submit
          </div>
        )}

        {rounds.length > 0 && (
          <div className="mt-14">
            <div className="font-mono text-[11px] tracking-[3px] uppercase text-muted mb-5 flex items-center gap-[10px]">
              <span className="w-6 h-px bg-border" />
              Answered
            </div>
            <ol className="space-y-[2px]">
              {rounds.map((r, i) => (
                <RoundRow key={i} index={i} round={r} />
              ))}
            </ol>
          </div>
        )}
      </div>
    </main>
  );
}

function RoundRow({ index, round }: { index: number; round: Round }) {
  const b = band(round.diff);
  return (
    <li className="flex items-center justify-between bg-surface border border-border rounded-[4px] px-5 py-4">
      <div className="flex items-center gap-5 min-w-0">
        <span className="font-display text-[28px] leading-none w-8 shrink-0 text-muted">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">
            {round.artist}
          </div>
          <div className="font-mono text-[11px] tracking-[1px] uppercase text-muted mt-1">
            You {round.guess} · Actual {round.actual}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <span
          className={`font-mono text-[11px] tracking-[2px] uppercase ${bandClass(b)}`}
        >
          {bandEmoji(b)} {round.diff} off
        </span>
      </div>
    </li>
  );
}

function TopBar({ snapshotDate }: { snapshotDate: string }) {
  return (
    <div className="flex items-center justify-between">
      <Link
        href="/"
        className="font-mono text-[11px] tracking-[2px] uppercase text-muted hover:text-foreground transition"
      >
        ← Back
      </Link>
      <span className="font-mono text-[11px] tracking-[2px] uppercase text-muted">
        Daily · {snapshotDate}
      </span>
    </div>
  );
}

function LoadingState({ snapshotDate }: { snapshotDate: string }) {
  return (
    <main className="flex-1 flex items-center justify-center px-5 sm:px-10 pt-32 pb-16">
      <div className="w-full max-w-3xl">
        <TopBar snapshotDate={snapshotDate} />
        <div className="mt-20 font-mono text-[11px] tracking-[2px] uppercase text-muted text-center">
          Loading…
        </div>
      </div>
    </main>
  );
}

function Results({
  completed,
  snapshotDate,
  onSubmitted,
}: {
  completed: Completed;
  snapshotDate: string;
  onSubmitted: (name: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[] | null>(null);
  const [leaderboardErr, setLeaderboardErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    const { data, error } = await supabase
      .from("daily_scores")
      .select("player_name, score, created_at")
      .eq("snapshot_date", snapshotDate)
      .order("score", { ascending: true })
      .limit(10);
    if (error) {
      setLeaderboardErr(error.message);
      return;
    }
    setLeaderboard((data ?? []) as LeaderboardRow[]);
  }, [snapshotDate]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const shareText = useMemo(() => {
    const lines = [
      `The Spotify Game — Daily Challenge ${formatShareDate(snapshotDate)}`,
      "",
      ...completed.rounds.map((r, i) => {
        const b = band(r.diff);
        return `Artist ${i + 1}: ${r.diff} off ${bandEmoji(b)}`;
      }),
      "",
      `Total: ${completed.total}`,
    ];
    return lines.join("\n");
  }, [completed, snapshotDate]);

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "The Spotify Game",
          text: shareText,
        });
        return;
      }
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // cancelled or unsupported
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitErr(null);
    const clean = name.trim();
    if (!clean) {
      setSubmitErr("Enter a name to submit.");
      return;
    }
    if (clean.length > 20) {
      setSubmitErr("Name must be 20 characters or fewer.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("daily_scores").insert({
      snapshot_date: snapshotDate,
      player_name: clean,
      score: completed.total,
    });
    setSubmitting(false);
    if (error) {
      setSubmitErr(error.message);
      return;
    }
    onSubmitted(clean);
    fetchLeaderboard();
  }

  return (
    <main className="flex-1 flex items-start justify-center px-5 sm:px-10 pt-32 pb-16">
      <div className="w-full max-w-2xl">
        <TopBar snapshotDate={snapshotDate} />

        <div className="mt-8 bg-surface border border-border rounded-lg p-8 sm:p-12">
          <div className="flex items-center justify-between mb-8">
            <div className="font-mono text-[11px] tracking-[3px] uppercase text-spotify flex items-center gap-[10px]">
              <span className="w-6 h-px bg-spotify" />
              Daily Result
            </div>
            <span className="font-mono text-[10px] tracking-[2px] uppercase text-muted">
              {snapshotDate}
            </span>
          </div>

          <div className="text-center">
            <div className="font-mono text-[11px] tracking-[3px] uppercase text-muted mb-3">
              Total — lower is better
            </div>
            <div
              className="font-display leading-none text-spotify"
              style={{ fontSize: "clamp(80px, 20vw, 180px)" }}
            >
              {completed.total}
            </div>
          </div>

          <ol className="mt-10 space-y-[2px]">
            {completed.rounds.map((r, i) => (
              <RoundRow key={i} index={i} round={r} />
            ))}
          </ol>

          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={share}
              className="bg-spotify text-background font-bold text-[15px] tracking-[0.5px] px-8 py-3.5 rounded-[4px] transition hover:-translate-y-px hover:bg-spotify-bright"
            >
              {copied ? "Copied!" : "Share score"}
            </button>
            <Link
              href="/"
              className="bg-transparent text-muted border border-transparent rounded-[4px] px-8 py-3.5 text-[15px] text-center hover:text-foreground transition"
            >
              Home
            </Link>
          </div>
        </div>

        <section className="mt-12">
          <div className="font-mono text-[11px] tracking-[3px] uppercase text-spotify mb-5 flex items-center gap-[10px]">
            <span className="w-6 h-px bg-spotify" />
            Leaderboard
          </div>

          {completed.submittedAs ? (
            <div className="bg-surface border border-border rounded-lg p-5 mb-5 font-mono text-[11px] tracking-[2px] uppercase text-muted">
              Submitted as{" "}
              <span className="text-spotify">{completed.submittedAs}</span>
            </div>
          ) : (
            <form
              onSubmit={submit}
              className="bg-surface border border-border rounded-lg p-5 mb-5 flex flex-col sm:flex-row gap-3 sm:items-center"
            >
              <label
                htmlFor="lb-name"
                className="font-mono text-[11px] tracking-[2px] uppercase text-muted sm:shrink-0"
              >
                Your name
              </label>
              <input
                id="lb-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                placeholder="optional"
                className="focus-green flex-1 rounded-[4px] bg-background border border-border px-3 py-2 text-foreground placeholder:text-muted/60 transition"
              />
              <button
                type="submit"
                disabled={submitting}
                className="bg-spotify text-background font-bold text-[13px] tracking-[0.5px] px-5 py-2.5 rounded-[4px] transition hover:-translate-y-px hover:bg-spotify-bright disabled:opacity-50 disabled:translate-y-0"
              >
                {submitting ? "Submitting…" : "Submit score"}
              </button>
            </form>
          )}
          {submitErr && (
            <div className="font-mono text-[11px] tracking-[1px] uppercase text-red mb-4">
              {submitErr}
            </div>
          )}

          <Leaderboard
            rows={leaderboard}
            err={leaderboardErr}
            highlightName={completed.submittedAs}
          />
        </section>
      </div>
    </main>
  );
}

function Leaderboard({
  rows,
  err,
  highlightName,
}: {
  rows: LeaderboardRow[] | null;
  err: string | null;
  highlightName: string | null;
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
        No scores submitted yet — be the first.
      </div>
    );
  }
  return (
    <ol className="bg-surface border border-border rounded-lg overflow-hidden">
      {rows.map((row, i) => {
        const mine = highlightName && row.player_name === highlightName;
        return (
          <li
            key={`${row.created_at}-${i}`}
            className={`flex items-center gap-4 px-5 py-3 border-b border-border/60 last:border-b-0 ${mine ? "bg-spotify/5" : ""}`}
          >
            <span
              className={`font-display text-[20px] leading-none w-8 shrink-0 ${i === 0 ? "text-spotify" : "text-muted"}`}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span
              className={`flex-1 truncate ${mine ? "text-spotify font-medium" : "text-foreground"}`}
            >
              {row.player_name}
            </span>
            <span className="font-mono text-[13px] text-muted">
              {row.score}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
