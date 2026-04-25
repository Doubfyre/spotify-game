"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserSupabase, type ArtistRow } from "@/lib/supabase";
import { fuzzyFind } from "@/lib/fuzzy";
import { trackEvent } from "@/lib/tracking";
import ArtistAvatar from "@/app/_components/ArtistAvatar";
import HighScoreLeaderboard from "@/app/_components/HighScoreLeaderboard";
import LeaderboardSubmitForm, {
  prefillName,
} from "@/app/_components/LeaderboardSubmitForm";

const TOTAL_ROUNDS = 5;
// Perfect game = the five highest-scoring picks, i.e. ranks 500, 499, 498,
// 497, 496. Ranks are unique (one artist per position) so you can't pick
// 500 five times; this is the real achievable ceiling.
const MAX_POSSIBLE = 500 + 499 + 498 + 497 + 496; // 2490

type Pick = {
  round: number;
  input: string;
  matched: ArtistRow | null;
  points: number;
};

function pointsForRank(rank: number | null): number {
  if (rank === null || rank < 1 || rank > 500) return 0;
  return rank;
}

export default function SoloGame({
  artists,
  snapshotDate,
}: {
  artists: ArtistRow[];
  snapshotDate: string;
}) {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Fire one solo_start on first mount. Subsequent "Play again" rounds
  // fire from reset() below, so every distinct game start is tracked.
  useEffect(() => {
    void trackEvent("solo_start");
  }, []);

  const round = picks.length;
  const isDone = round >= TOTAL_ROUNDS;
  const totalScore = picks.reduce((sum, p) => sum + p.points, 0);

  const pickedRanks = useMemo(
    () =>
      new Set(
        picks.map((p) => p.matched?.rank).filter((r): r is number => r != null),
      ),
    [picks],
  );

  function submitGuess() {
    const input = query.trim();
    if (!input) return;
    const candidates = artists.filter((a) => !pickedRanks.has(a.rank));
    const match = fuzzyFind(input, candidates);
    setPicks((prev) => [
      ...prev,
      {
        round: prev.length + 1,
        input,
        matched: match,
        points: pointsForRank(match?.rank ?? null),
      },
    ]);
    setQuery("");
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submitGuess();
    } else if (e.key === "Escape") {
      setQuery("");
    }
  }

  function reset() {
    setPicks([]);
    setQuery("");
    inputRef.current?.focus();
    void trackEvent("solo_start");
  }

  if (isDone) {
    return (
      <Results
        picks={picks}
        total={totalScore}
        snapshotDate={snapshotDate}
        onReset={reset}
      />
    );
  }

  return (
    <main className="flex-1 flex flex-col px-5 sm:px-10 pt-32 pb-16">
      <div className="w-full max-w-3xl mx-auto">
        <TopBar snapshotDate={snapshotDate} />

        <div className="mt-10 flex items-start justify-between gap-6">
          <div>
            <div className="font-mono text-[11px] tracking-[3px] uppercase text-spotify mb-3 flex items-center gap-[10px]">
              <span className="w-6 h-px bg-spotify" />
              Round {round + 1} / {TOTAL_ROUNDS}
            </div>
            <h1
              className="font-display leading-none tracking-[2px] text-foreground"
              style={{ fontSize: "clamp(56px, 10vw, 112px)" }}
            >
              NAME AN
              <br />
              ARTIST
            </h1>
            <p className="text-muted mt-4 font-light max-w-md">
              Type an artist you think is in today&rsquo;s Spotify top 500,
              then press Enter. Spelling is forgiving.
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono text-[11px] tracking-[3px] uppercase text-muted mb-2">
              Score
            </div>
            <div className="font-display text-6xl sm:text-7xl leading-none text-spotify">
              {totalScore}
            </div>
          </div>
        </div>

        <div className="mt-10">
          <input
            ref={inputRef}
            type="text"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            aria-label="Artist guess"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Taylor Swift"
            className="focus-green w-full rounded-[4px] bg-surface border border-border px-5 py-4 text-lg text-foreground placeholder:text-muted/60 transition"
          />
          <div className="font-mono text-[10px] tracking-[2px] uppercase text-muted mt-3">
            Press Enter to submit · Esc to clear
          </div>
        </div>

        <div className="mt-14">
          <div className="font-mono text-[11px] tracking-[3px] uppercase text-muted mb-5 flex items-center gap-[10px]">
            <span className="w-6 h-px bg-border" />
            Your picks
          </div>
          <ol className="space-y-[2px]">
            {Array.from({ length: TOTAL_ROUNDS }, (_, i) => (
              <PickRow
                key={i}
                index={i}
                pick={picks[i]}
                isUpNext={i === round}
              />
            ))}
          </ol>
        </div>
      </div>
    </main>
  );
}

function PickRow({
  index,
  pick,
  isUpNext,
}: {
  index: number;
  pick: Pick | undefined;
  isUpNext: boolean;
}) {
  const isMatched = pick && pick.matched;
  const isMissed = pick && !pick.matched;

  const classes = pick
    ? isMatched
      ? "bg-surface border border-border"
      : "bg-surface border border-border opacity-80"
    : isUpNext
      ? "bg-surface/50 border border-dashed border-spotify/40"
      : "bg-surface/30 border border-dashed border-border/60 opacity-50";

  return (
    <li
      className={`flex items-center justify-between rounded-[4px] px-5 py-4 transition ${classes}`}
    >
      <div className="flex items-center gap-5 min-w-0">
        <span
          className={`font-display text-[28px] leading-none w-8 shrink-0 ${isMatched ? "text-spotify" : "text-muted"}`}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        {pick ? (
          pick.matched ? (
            <>
              <ArtistAvatar
                imageHash={pick.matched.image_hash}
                alt={pick.matched.artist_name}
                size={40}
              />
              <span className="truncate text-foreground font-medium">
                {pick.matched.artist_name}
              </span>
            </>
          ) : (
            <span className="truncate text-muted italic font-light">
              &ldquo;{pick.input}&rdquo;
            </span>
          )
        ) : (
          <span className="font-mono text-[11px] tracking-[2px] uppercase text-muted">
            {isUpNext ? "Up next" : "—"}
          </span>
        )}
      </div>
      {pick && (
        <div className="flex items-center gap-5 shrink-0">
          {isMissed ? (
            <span className="font-mono text-[11px] tracking-[2px] uppercase text-muted">
              Not in top 500
            </span>
          ) : (
            <span className="font-mono text-[12px] text-muted">
              Rank #{pick.matched!.rank}
            </span>
          )}
          <span
            className={`font-display text-[26px] leading-none w-16 text-right ${isMatched ? "text-spotify" : "text-muted"}`}
          >
            +{pick.points}
          </span>
        </div>
      )}
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
        Snapshot {snapshotDate}
      </span>
    </div>
  );
}

function Results({
  picks,
  total,
  snapshotDate,
  onReset,
}: {
  picks: Pick[];
  total: number;
  snapshotDate: string;
  onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);
  // "pending" — show submit form; "submitted"/"skipped" — show leaderboard.
  // submittedAs / submittedMetric reflect the row that actually exists
  // in solo_scores for this player (may be an older, better score if
  // the conditional upsert decided to keep it). Both are passed to
  // HighScoreLeaderboard for the "your row" highlight.
  const [submitStatus, setSubmitStatus] = useState<
    "pending" | "submitted" | "skipped"
  >("pending");
  const [submittedAs, setSubmittedAs] = useState<string | null>(null);
  const [submittedMetric, setSubmittedMetric] = useState<number | null>(null);
  const [initialName, setInitialName] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const percent = Math.round((total / MAX_POSSIBLE) * 100);

  // One solo_complete per mount of Results — Results mounts exactly
  // once per completed game (Play Again unmounts + remounts it).
  useEffect(() => {
    void trackEvent("solo_complete");
  }, []);

  // Save personal best (unconditional) + resolve the current user so we
  // can pre-fill the submit form. The public solo_scores insert happens
  // only when the player clicks Submit in the form below.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("solo-best-score");
      const prev = raw !== null ? Number(raw) : 0;
      if (!Number.isFinite(prev) || total > prev) {
        localStorage.setItem("solo-best-score", String(total));
      }
    } catch {
      // localStorage disabled — skip silently
    }
    // Pre-fill name from localStorage / email. Runs once on mount; the
    // user can edit the field freely after.
    setInitialName(prefillName(null));
    (async () => {
      try {
        const supa = createBrowserSupabase();
        const {
          data: { user },
        } = await supa.auth.getUser();
        if (!user) return;
        setUserEmail(user.email ?? null);
        // Refine pre-fill now that we know the email.
        setInitialName(prefillName(user.email ?? null));

        // Ensure a profile row exists. Idempotent — if the row already
        // exists, ignoreDuplicates makes this a no-op and leaves existing
        // stats untouched.
        const { error: upsertErr } = await supa
          .from("profiles")
          .upsert({ id: user.id }, { onConflict: "id", ignoreDuplicates: true });
        if (upsertErr) {
          console.error("[solo] profiles upsert failed", upsertErr);
          return;
        }
        // Read-then-write best score. We only ever want to raise the
        // record, so read first, compare, then write if strictly better.
        const { data: prof, error: readErr } = await supa
          .from("profiles")
          .select("solo_best_score")
          .eq("id", user.id)
          .maybeSingle();
        if (readErr) {
          console.error("[solo] profiles read failed", readErr);
          return;
        }
        const currentBest =
          (prof as { solo_best_score: number | null } | null)
            ?.solo_best_score ?? null;
        if (currentBest !== null && currentBest >= total) return;
        const { error: writeErr } = await supa
          .from("profiles")
          .update({ solo_best_score: total })
          .eq("id", user.id);
        if (writeErr) {
          console.error("[solo] profiles write failed", writeErr);
        }
      } catch (err) {
        console.error("[solo] save best score threw", err);
      }
    })();
  }, [total]);

  async function submitLeaderboard(name: string) {
    const supa = createBrowserSupabase();
    const {
      data: { user },
    } = await supa.auth.getUser();

    if (user?.id) {
      // Logged-in: dedupe on user_id via select-then-update-or-insert.
      // PostgREST upsert with onConflict can't target a partial unique
      // index (WHERE user_id IS NOT NULL), so we drive the dedupe from
      // the client. Race window between the read and the write is
      // tiny in practice — one user, one browser, one click.
      const { data: existing, error: readErr } = await supa
        .from("solo_scores")
        .select("player_name, score")
        .eq("user_id", user.id)
        .maybeSingle();
      if (readErr) {
        console.error("[solo] solo_scores read failed", readErr);
        throw new Error(readErr.message);
      }
      const existingRow = existing as
        | { player_name: string; score: number }
        | null;

      if (existingRow) {
        if (existingRow.score >= total) {
          // Their stored best is already at least this good — don't
          // overwrite. Highlight the existing row in the leaderboard.
          setSubmittedAs(existingRow.player_name);
          setSubmittedMetric(existingRow.score);
          setSubmitStatus("submitted");
          return;
        }
        const { error: updateErr } = await supa
          .from("solo_scores")
          .update({ player_name: name, score: total })
          .eq("user_id", user.id);
        if (updateErr) {
          console.error("[solo] solo_scores update failed", updateErr);
          throw new Error(updateErr.message);
        }
      } else {
        const { error: insertErr } = await supa.from("solo_scores").insert({
          user_id: user.id,
          player_name: name,
          score: total,
        });
        if (insertErr) {
          console.error("[solo] solo_scores insert failed", insertErr);
          throw new Error(insertErr.message);
        }
      }
      setSubmittedAs(name);
      setSubmittedMetric(total);
      setSubmitStatus("submitted");
      return;
    }

    // Anonymous: no user_id means no dedupe target. Insert a new row.
    // The leaderboard views collapse duplicate player_names client-side
    // as a best-effort fallback.
    const { error } = await supa.from("solo_scores").insert({
      user_id: null,
      player_name: name,
      score: total,
    });
    if (error) {
      console.error("[solo] solo_scores insert failed", error);
      throw new Error(error.message);
    }
    setSubmittedAs(name);
    setSubmittedMetric(total);
    setSubmitStatus("submitted");
  }

  function skipLeaderboard() {
    setSubmitStatus("skipped");
  }
  // Silence unused-var lint on userEmail until/unless we surface it in
  // the submit form copy. Kept so future edits can show "Signed in as X".
  void userEmail;

  async function share() {
    const text = `I scored ${total}/${MAX_POSSIBLE} on The Spotify Game — Solo ${snapshotDate}`;
    const url = typeof window !== "undefined" ? window.location.origin : "";
    try {
      if (navigator.share) {
        await navigator.share({ title: "The Spotify Game", text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // user cancelled or unsupported — silently do nothing
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center px-5 sm:px-10 pt-32 pb-16">
      <div className="w-full max-w-2xl">
        <div className="bg-surface border border-border rounded-lg p-8 sm:p-12">
          <div className="flex items-center justify-between mb-8">
            <div className="font-mono text-[11px] tracking-[3px] uppercase text-spotify flex items-center gap-[10px]">
              <span className="w-6 h-px bg-spotify" />
              Final Result
            </div>
            <span className="font-mono text-[10px] tracking-[2px] uppercase text-muted">
              {snapshotDate}
            </span>
          </div>

          <div className="text-center">
            <div
              className="font-display leading-none text-spotify"
              style={{ fontSize: "clamp(80px, 20vw, 180px)" }}
            >
              {total}
            </div>
            <div className="font-mono text-[11px] tracking-[3px] uppercase text-muted mt-3">
              {percent}% of a perfect game · {total} / {MAX_POSSIBLE}
            </div>
          </div>

          <ol className="mt-10 space-y-[2px]">
            {picks.map((pick, i) => (
              <PickRow key={i} index={i} pick={pick} isUpNext={false} />
            ))}
          </ol>

          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={onReset}
              className="bg-spotify text-background font-bold text-[15px] tracking-[0.5px] px-8 py-3.5 rounded-[4px] transition hover:-translate-y-px hover:bg-spotify-bright"
            >
              Play again
            </button>
            <button
              type="button"
              onClick={share}
              className="bg-transparent text-foreground border border-border rounded-[4px] px-8 py-3.5 text-[15px] transition hover:border-foreground hover:-translate-y-px"
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

        {submitStatus === "pending" ? (
          <LeaderboardSubmitForm
            initialName={initialName}
            metricLabel="score"
            onSubmit={submitLeaderboard}
            onSkip={skipLeaderboard}
          />
        ) : (
          <HighScoreLeaderboard
            table="solo_scores"
            metricColumn="score"
            metricLabel="Score"
            player={
              submittedAs !== null && submittedMetric !== null
                ? { name: submittedAs, metric: submittedMetric }
                : null
            }
          />
        )}
      </div>
    </main>
  );
}
