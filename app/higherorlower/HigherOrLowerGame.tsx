"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import ArtistAvatar from "@/app/_components/ArtistAvatar";

export type HLArtist = {
  rank: number;
  artist_name: string;
  spotify_id: string | null;
  image_hash: string | null;
  monthly_listeners: number;
};

// Fisher-Yates. Non-deterministic by design — per spec, every run should
// be different, so no seeded RNG here.
function shuffle<T>(input: T[]): T[] {
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function formatListeners(n: number): string {
  return n.toLocaleString();
}

type Phase = "play" | "reveal" | "over";
type Side = "left" | "right";

export default function HigherOrLowerGame({
  artists,
  snapshotDate,
}: {
  artists: HLArtist[];
  snapshotDate: string;
}) {
  // The deck is shuffled once per mount. "Play again" bumps gameId which
  // forces a reshuffle (see effect below). Using an effect to populate the
  // deck avoids SSR/client hydration mismatch that would come from calling
  // Math.random() during the first render.
  const [gameId, setGameId] = useState(0);
  const [deck, setDeck] = useState<HLArtist[]>([]);
  const [cursor, setCursor] = useState(1); // index of the "next" card to reveal
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [phase, setPhase] = useState<Phase>("play");
  const [lastGuess, setLastGuess] = useState<Side | null>(null);
  const [correctSide, setCorrectSide] = useState<Side | null>(null);

  useEffect(() => {
    setDeck(shuffle(artists));
    setCursor(1);
    setStreak(0);
    setPhase("play");
    setLastGuess(null);
    setCorrectSide(null);
  }, [artists, gameId]);

  // Load the player's best streak on mount. Server record wins for signed-in
  // users; falls back to localStorage for anonymous.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supa = createBrowserSupabase();
        const {
          data: { user },
        } = await supa.auth.getUser();
        if (user) {
          const { data } = await supa
            .from("profiles")
            .select("higher_lower_best_streak")
            .eq("id", user.id)
            .maybeSingle();
          const v =
            data &&
            typeof (data as { higher_lower_best_streak: number | null })
              .higher_lower_best_streak === "number"
              ? (data as { higher_lower_best_streak: number })
                  .higher_lower_best_streak
              : null;
          if (!cancelled && v !== null) {
            setBest(v);
            return;
          }
        }
      } catch {
        // fall through to localStorage
      }
      try {
        const raw = localStorage.getItem("higher-lower-best-streak");
        if (raw !== null) {
          const n = Number(raw);
          if (Number.isFinite(n) && n >= 0 && !cancelled) setBest(n);
        }
      } catch {
        // localStorage disabled — leave at 0
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const left = deck[cursor - 1];
  const right = deck[cursor];
  const deckExhausted = deck.length > 0 && cursor >= deck.length;

  function guess(side: Side) {
    if (phase !== "play" || !left || !right) return;
    // Ties: give it to the player (both sides count as correct). This
    // keeps the game playable even when two artists are near-identical.
    const leftIsHigher = left.monthly_listeners >= right.monthly_listeners;
    const rightIsHigher = right.monthly_listeners >= left.monthly_listeners;
    const correct =
      (side === "left" && leftIsHigher) ||
      (side === "right" && rightIsHigher);
    setLastGuess(side);
    setCorrectSide(
      leftIsHigher && rightIsHigher
        ? side // tie — highlight whatever they picked
        : leftIsHigher
          ? "left"
          : "right",
    );
    setPhase("reveal");

    window.setTimeout(() => {
      if (correct) {
        setStreak((s) => s + 1);
        // If we've just revealed the last pairing, end the game on a win.
        if (cursor + 1 >= deck.length) {
          setPhase("over");
        } else {
          setCursor((c) => c + 1);
          setPhase("play");
          setLastGuess(null);
          setCorrectSide(null);
        }
      } else {
        setPhase("over");
      }
    }, 1400);
  }

  // Save best streak whenever the game ends. Writes to localStorage
  // unconditionally (works for anon + cache for signed-in) and attempts an
  // atomic conditional UPDATE on profiles — only writes if the new streak
  // beats the stored value (or it's null). No read-then-write race.
  useEffect(() => {
    if (phase !== "over") return;
    const final = streak;
    try {
      const raw = localStorage.getItem("higher-lower-best-streak");
      const prev = raw !== null ? Number(raw) : 0;
      if (!Number.isFinite(prev) || final > prev) {
        localStorage.setItem("higher-lower-best-streak", String(final));
      }
    } catch {
      // localStorage disabled — skip silently
    }
    if (final > best) setBest(final);
    (async () => {
      if (final <= 0) return;
      try {
        const supa = createBrowserSupabase();
        const {
          data: { user },
        } = await supa.auth.getUser();
        if (!user) return;
        await supa
          .from("profiles")
          .update({ higher_lower_best_streak: final })
          .eq("id", user.id)
          .or(
            `higher_lower_best_streak.is.null,higher_lower_best_streak.lt.${final}`,
          );
      } catch {
        // Network/auth issue — localStorage still has the record
      }
    })();
    // `best` is intentionally excluded from deps — reading a stale snapshot
    // of it is fine, and including it would cause a second save right after
    // setBest updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, streak]);

  if (phase === "over") {
    return (
      <GameOver
        streak={streak}
        best={best}
        snapshotDate={snapshotDate}
        correctSide={correctSide}
        left={left}
        right={right}
        onPlayAgain={() => setGameId((g) => g + 1)}
      />
    );
  }

  if (deckExhausted || !left || !right) {
    // Shouldn't happen in practice (we end the game on the last correct
    // guess), but render a safe state just in case.
    return (
      <main className="flex-1 flex items-center justify-center px-5 sm:px-10 pt-32 pb-16">
        <div className="text-muted">Loading…</div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col px-5 sm:px-10 pt-28 pb-10">
      <div className="w-full max-w-5xl mx-auto flex-1 flex flex-col">
        <TopBar snapshotDate={snapshotDate} streak={streak} best={best} />

        <div className="mt-6 sm:mt-10 flex-1 grid grid-cols-2 gap-3 sm:gap-6">
          <Card
            artist={left}
            side="left"
            phase={phase}
            revealed={phase === "reveal"}
            wasPicked={lastGuess === "left"}
            wasCorrectSide={correctSide === "left"}
            onPick={() => guess("left")}
          />
          <Card
            artist={right}
            side="right"
            phase={phase}
            revealed={phase === "reveal"}
            wasPicked={lastGuess === "right"}
            wasCorrectSide={correctSide === "right"}
            onPick={() => guess("right")}
          />
        </div>

        <div className="mt-6 text-center font-mono text-[11px] tracking-[2px] uppercase text-muted">
          Which artist has more monthly listeners?
        </div>
      </div>
    </main>
  );
}

function TopBar({
  snapshotDate,
  streak,
  best,
}: {
  snapshotDate: string;
  streak: number;
  best: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Link
        href="/"
        className="font-mono text-[11px] tracking-[2px] uppercase text-muted hover:text-foreground transition shrink-0"
      >
        ← Back
      </Link>
      <div className="flex items-center gap-6">
        <div className="text-center">
          <div className="font-mono text-[10px] tracking-[2px] uppercase text-muted">
            Streak
          </div>
          <div className="font-display text-3xl sm:text-4xl leading-none text-spotify tabular-nums">
            {streak}
          </div>
        </div>
        <div className="text-center">
          <div className="font-mono text-[10px] tracking-[2px] uppercase text-muted">
            Best
          </div>
          <div className="font-display text-3xl sm:text-4xl leading-none text-foreground tabular-nums">
            {best}
          </div>
        </div>
      </div>
      <span className="hidden sm:inline font-mono text-[11px] tracking-[2px] uppercase text-muted shrink-0">
        {snapshotDate}
      </span>
    </div>
  );
}

function Card({
  artist,
  phase,
  revealed,
  wasPicked,
  wasCorrectSide,
  onPick,
}: {
  artist: HLArtist;
  side: Side;
  phase: Phase;
  revealed: boolean;
  wasPicked: boolean;
  wasCorrectSide: boolean;
  onPick: () => void;
}) {
  // Border + tint reflect reveal state. We tint the correct side green and
  // the wrong pick red; cards not involved in the comparison stay neutral.
  let stateClasses = "border-border hover:border-spotify/60";
  if (revealed) {
    if (wasCorrectSide) {
      stateClasses = "border-spotify bg-spotify/10";
    } else if (wasPicked) {
      stateClasses = "border-red bg-red/10";
    } else {
      stateClasses = "border-border";
    }
  }

  return (
    <button
      type="button"
      onClick={onPick}
      disabled={phase !== "play"}
      className={`relative bg-surface border rounded-lg transition-colors duration-200 flex flex-col items-center justify-center p-4 sm:p-6 text-center overflow-hidden ${stateClasses} ${
        phase === "play" ? "cursor-pointer" : "cursor-default"
      }`}
    >
      <ArtistAvatar
        imageHash={artist.image_hash}
        alt={artist.artist_name}
        size={160}
      />
      <div
        className="mt-4 font-display tracking-[1.5px] leading-[0.95] text-foreground"
        style={{ fontSize: "clamp(22px, 4vw, 44px)" }}
      >
        {artist.artist_name}
      </div>
    </button>
  );
}

function GameOver({
  streak,
  best,
  snapshotDate,
  correctSide,
  left,
  right,
  onPlayAgain,
}: {
  streak: number;
  best: number;
  snapshotDate: string;
  correctSide: Side | null;
  left: HLArtist | undefined;
  right: HLArtist | undefined;
  onPlayAgain: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const isNewBest = streak > 0 && streak >= best;
  // Only show the final pairing reveal if the game actually ended on a
  // wrong guess (i.e. we know which side was correct). Ending from deck
  // exhaustion is unreachable in practice but guarded anyway.
  const showFinalPairing = correctSide !== null && left && right;

  async function share() {
    const text = `🎵 The Spotify Game — Higher or Lower\nI hit a streak of ${streak} on ${snapshotDate}. Can you beat it?`;
    const url =
      typeof window !== "undefined"
        ? `https://${window.location.host}/higherorlower`
        : "";
    try {
      if (navigator.share) {
        await navigator.share({ text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text}\n${url}`);
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
              Game Over
            </div>
            <span className="font-mono text-[10px] tracking-[2px] uppercase text-muted">
              {snapshotDate}
            </span>
          </div>

          <div className="text-center">
            <div className="font-mono text-[11px] tracking-[3px] uppercase text-muted mb-2">
              Final streak
            </div>
            <div
              className="font-display leading-none text-spotify tabular-nums"
              style={{ fontSize: "clamp(80px, 20vw, 180px)" }}
            >
              {streak}
            </div>
            <div className="font-mono text-[11px] tracking-[2px] uppercase text-muted mt-3">
              Best: {best.toLocaleString()}
              {isNewBest && streak > 0 && (
                <span className="ml-2 text-spotify">· NEW BEST</span>
              )}
            </div>
          </div>

          {showFinalPairing && (
            <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4">
              <FinalCard
                artist={left}
                correct={correctSide === "left"}
              />
              <FinalCard
                artist={right}
                correct={correctSide === "right"}
              />
            </div>
          )}

          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={onPlayAgain}
              className="bg-spotify text-background font-bold text-[15px] tracking-[0.5px] px-8 py-3.5 rounded-[4px] transition hover:-translate-y-px hover:bg-spotify-bright"
            >
              Play again
            </button>
            <button
              type="button"
              onClick={share}
              className="bg-transparent text-foreground border border-border rounded-[4px] px-8 py-3.5 text-[15px] transition hover:border-foreground hover:-translate-y-px"
            >
              {copied ? "Copied!" : "Share streak"}
            </button>
            <Link
              href="/"
              className="bg-transparent text-muted border border-transparent rounded-[4px] px-8 py-3.5 text-[15px] text-center hover:text-foreground transition"
            >
              Home
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

function FinalCard({
  artist,
  correct,
}: {
  artist: HLArtist;
  correct: boolean;
}) {
  return (
    <div
      className={`bg-background border rounded-[6px] p-4 text-center ${correct ? "border-spotify" : "border-border"}`}
    >
      <div className="flex justify-center">
        <ArtistAvatar
          imageHash={artist.image_hash}
          alt={artist.artist_name}
          size={72}
        />
      </div>
      <div className="mt-3 font-display text-lg leading-tight text-foreground truncate">
        {artist.artist_name}
      </div>
      <div
        className={`mt-2 font-display text-2xl leading-none tabular-nums ${correct ? "text-spotify" : "text-muted"}`}
      >
        {formatListeners(artist.monthly_listeners)}
      </div>
      <div className="mt-1 font-mono text-[9px] tracking-[2px] uppercase text-muted">
        monthly listeners
      </div>
    </div>
  );
}
