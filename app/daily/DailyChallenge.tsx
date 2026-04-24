"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, createBrowserSupabase } from "@/lib/supabase";
import { getTodayLondon } from "@/lib/dates";
import ArtistAvatar from "@/app/_components/ArtistAvatar";

export type ArtistPick = {
  rank: number;
  artist_name: string;
  image_hash: string | null;
};

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
  if (diff < 100) return "green";
  if (diff < 200) return "amber";
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

// 1 → "1st", 2 → "2nd", 3 → "3rd", 11 → "11th", 21 → "21st", etc.
function ordinal(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

const LEADERBOARD_LIMIT = 50;
const LEADERBOARD_POLL_MS = 30_000;

export default function DailyChallenge({
  picks,
  snapshotDate,
  alreadyPlayed = false,
  existingScore = null,
  existingName = null,
}: {
  picks: ArtistPick[];
  snapshotDate: string;
  alreadyPlayed?: boolean;
  existingScore?: number | null;
  existingName?: string | null;
}) {
  const [hydrated, setHydrated] = useState(false);
  // If the server told us this logged-in user has already submitted a row
  // for today (on this device or another), seed the completed state so the
  // client renders the results screen directly — no replay, no duplicate
  // submission.
  const [completed, setCompleted] = useState<Completed | null>(() => {
    if (alreadyPlayed && existingScore !== null) {
      return {
        date: snapshotDate,
        rounds: [], // round-level detail isn't stored in daily_scores
        total: existingScore,
        submittedAs: existingName,
      };
    }
    return null;
  });
  const [currentIdx, setCurrentIdx] = useState(0);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // On mount: always try localStorage first. If the user played on this
  // device, localStorage has the full round-by-round detail (diffs per
  // guess) — richer than what daily_scores stores. That data is what the
  // share card needs. The server-seeded initial state (alreadyPlayed with
  // rounds: []) stays as a fallback for genuine cross-device cases where
  // localStorage has nothing.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(snapshotDate));
      if (raw) {
        const parsed = JSON.parse(raw) as Completed;
        if (
          parsed &&
          parsed.date === snapshotDate &&
          Array.isArray(parsed.rounds) &&
          parsed.rounds.length > 0
        ) {
          setCompleted(parsed);
        }
      }
    } catch {
      // malformed — ignore, user keeps whatever initial state we seeded
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
            {/* key forces remount when the round advances, so the reveal
               animation replays on each new artist */}
            <ArtistAvatar
              key={currentPick.artist_name}
              imageHash={currentPick.image_hash}
              alt={currentPick.artist_name}
              size={120}
              className="mb-5 animate-modal-scale-in"
            />
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
  const [playerRank, setPlayerRank] = useState<number | null>(null);
  const [totalPlayers, setTotalPlayers] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const submittedAs = completed.submittedAs;
  const playerScore = completed.total;

  // Pre-fill the leaderboard name from the logged-in user's profile if they
  // have one, and capture their user_id so the submit can attribute the
  // score to them. Anonymous players get a blank input and null user_id.
  useEffect(() => {
    if (submittedAs) return;
    let cancelled = false;
    const authClient = createBrowserSupabase();
    authClient.auth.getUser().then(({ data: { user } }) => {
      if (cancelled || !user) return;
      setUserId(user.id);
      const local = user.email?.split("@")[0];
      const meta = user.user_metadata ?? {};
      const source = local ?? meta.full_name ?? meta.name ?? "";
      const prefill = String(source).trim().slice(0, 20);
      if (prefill) setName((prev) => (prev ? prev : prefill));
    });
    return () => {
      cancelled = true;
    };
  }, [submittedAs]);

  // Fires on mount, on submit, and every LEADERBOARD_POLL_MS. Runs up to
  // three queries in parallel:
  //   1. Top N rows (always)
  //   2. Total player count (only if the player has submitted)
  //   3. Count of scores strictly less than theirs — rank = that + 1
  //      (only if the player has submitted)
  const fetchLeaderboard = useCallback(async () => {
    // Recompute "today" in London at query time rather than using the
    // server-rendered `snapshotDate` prop, so the leaderboard rolls over at
    // midnight UK even if the tab has been open for hours.
    const londonToday = getTodayLondon();
    const topPromise = supabase
      .from("daily_scores")
      .select("player_name, score, created_at")
      .eq("snapshot_date", londonToday)
      .order("score", { ascending: true })
      .limit(LEADERBOARD_LIMIT);

    if (!submittedAs) {
      const { data, error } = await topPromise;
      if (error) {
        setLeaderboardErr(error.message);
        return;
      }
      setLeaderboardErr(null);
      setLeaderboard((data ?? []) as LeaderboardRow[]);
      setPlayerRank(null);
      setTotalPlayers(null);
      return;
    }

    const totalPromise = supabase
      .from("daily_scores")
      .select("*", { count: "exact", head: true })
      .eq("snapshot_date", londonToday);
    const lowerPromise = supabase
      .from("daily_scores")
      .select("*", { count: "exact", head: true })
      .eq("snapshot_date", londonToday)
      .lt("score", playerScore);

    const [topRes, totalRes, lowerRes] = await Promise.all([
      topPromise,
      totalPromise,
      lowerPromise,
    ]);
    const firstErr =
      topRes.error?.message ??
      totalRes.error?.message ??
      lowerRes.error?.message ??
      null;
    if (firstErr) {
      setLeaderboardErr(firstErr);
      return;
    }
    setLeaderboardErr(null);
    setLeaderboard((topRes.data ?? []) as LeaderboardRow[]);
    setTotalPlayers(totalRes.count ?? 0);
    setPlayerRank((lowerRes.count ?? 0) + 1);
  }, [submittedAs, playerScore]);

  // Poll every 30s so the leaderboard stays live through the day. Clears on
  // unmount or when the deps change (e.g. after submitting).
  useEffect(() => {
    fetchLeaderboard();
    const id = setInterval(fetchLeaderboard, LEADERBOARD_POLL_MS);
    return () => clearInterval(id);
  }, [fetchLeaderboard]);

  const shareText = useMemo(() => {
    const total = completed.total;
    // Intro line picked by total. Uses plain hyphens, no em-dash.
    let intro: string;
    if (total < 100) {
      intro = `I scored ${total} today - good luck beating that 👀`;
    } else if (total < 200) {
      intro = `I scored ${total} today - think you can do better?`;
    } else {
      intro = `I scored ${total} today - can you beat me?`;
    }
    const lines: string[] = [
      `🎵 The Spotify Game - Daily Challenge ${formatShareDate(snapshotDate)}`,
      "",
      intro,
    ];

    // Cross-device replay has `rounds: []` (round-level detail isn't stored
    // in daily_scores). Skip the per-artist block rather than printing
    // bogus zeros.
    if (completed.rounds.length > 0) {
      lines.push("");
      completed.rounds.forEach((r, i) => {
        lines.push(`Guess ${i + 1} - ${bandEmoji(band(r.diff))} ${r.diff} off`);
      });
    }

    lines.push(
      "",
      "Play today's challenge at https://spotify-game-six.vercel.app",
    );
    return lines.join("\n");
  }, [completed, snapshotDate]);

  async function share() {
    try {
      if (navigator.share) {
        // Omit `title` — receivers (e.g. Messages, Twitter) often prepend
        // it as a header above the body, which duplicates the first line
        // of our already branded share text.
        await navigator.share({ text: shareText });
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
      user_id: userId,
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
              {completed.rounds.length === 0
                ? "Already played today"
                : "Daily Result"}
            </div>
            <span className="font-mono text-[10px] tracking-[2px] uppercase text-muted">
              {snapshotDate}
            </span>
          </div>

          <div className="text-center">
            <div className="font-mono text-[11px] tracking-[3px] uppercase text-muted mb-3">
              {completed.rounds.length === 0
                ? "You've already played today's challenge"
                : "Total — lower is better"}
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
            <div className="bg-surface border border-border rounded-lg p-5 mb-5">
              <div className="font-mono text-[11px] tracking-[2px] uppercase text-muted">
                Submitted as{" "}
                <span className="text-spotify">{completed.submittedAs}</span>
              </div>
              {playerRank !== null && totalPlayers !== null && (
                <div className="mt-2 text-foreground">
                  You&rsquo;re ranked{" "}
                  <span className="font-display text-spotify text-[22px] tracking-[1px]">
                    {ordinal(playerRank)}
                  </span>{" "}
                  out of {totalPlayers}{" "}
                  {totalPlayers === 1 ? "player" : "players"} today
                </div>
              )}
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
            playerName={completed.submittedAs}
            playerScore={completed.total}
            playerRank={playerRank}
          />
        </section>
      </div>
    </main>
  );
}

function Leaderboard({
  rows,
  err,
  playerName,
  playerScore,
  playerRank,
}: {
  rows: LeaderboardRow[] | null;
  err: string | null;
  playerName: string | null;
  playerScore: number;
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
        No scores submitted yet — be the first.
      </div>
    );
  }

  // Mark the player's *own* row in the top-50 list by matching on name AND
  // score so other users who share a name aren't highlighted too. A single
  // player can still have multiple rows here only if they somehow submitted
  // twice with the same name and score (extremely rare — localStorage
  // normally prevents re-submission), in which case highlighting both is
  // acceptable.
  const mineInList = (row: LeaderboardRow) =>
    playerName !== null &&
    row.player_name === playerName &&
    row.score === playerScore;
  const inList = rows.some(mineInList);
  const outsideTop = playerName !== null && playerRank !== null && !inList;

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
            <span className="font-mono text-[13px] text-muted">
              {row.score}
            </span>
          </li>
        );
      })}

      {outsideTop && playerRank !== null && playerName !== null && (
        <>
          <li className="flex items-center gap-4 px-5 py-2 border-t border-border bg-background/40 font-mono text-[10px] tracking-[2px] uppercase text-muted">
            <span className="flex-1">Your score</span>
          </li>
          <li className="flex items-center gap-4 px-5 py-3 bg-spotify/5">
            <span className="font-display text-[20px] leading-none w-10 shrink-0 text-spotify">
              {playerRank}
            </span>
            <span className="flex-1 truncate text-spotify font-medium">
              {playerName}
            </span>
            <span className="font-mono text-[13px] text-spotify">
              {playerScore}
            </span>
          </li>
        </>
      )}
    </ol>
  );
}
