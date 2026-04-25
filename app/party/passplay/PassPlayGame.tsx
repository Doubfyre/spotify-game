"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ArtistRow } from "@/lib/supabase";
import { fuzzyFind } from "@/lib/fuzzy";
import { trackEvent } from "@/lib/tracking";
import ArtistAvatar from "@/app/_components/ArtistAvatar";

type Player = {
  id: string;
  name: string;
  score: number;
  picks: Pick[];
};

type Pick = {
  round: number;
  input: string;
  matched: ArtistRow | null;
  points: number;
};

type Status =
  | "setup"
  | "countdown"
  | "guessing"
  | "reveal"
  | "round_summary"
  | "game_over";

type LastPick = {
  playerName: string;
  input: string;
  matched: ArtistRow | null;
  points: number;
};

const ROUNDS_OPTIONS: Array<3 | 5 | 10> = [3, 5, 10];
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 2;

function pointsForRank(rank: number | null): number {
  if (rank === null || rank < 1 || rank > 500) return 0;
  return rank;
}

function rid(): string {
  // Good-enough unique id for client-local players
  return Math.random().toString(36).slice(2, 10);
}

export default function PassPlayGame({
  artists,
  snapshotDate,
}: {
  artists: ArtistRow[];
  snapshotDate: string;
}) {
  const [status, setStatus] = useState<Status>("setup");
  const [players, setPlayers] = useState<Player[]>([]);
  const [totalRounds, setTotalRounds] = useState<3 | 5 | 10>(5);
  const [currentRound, setCurrentRound] = useState(0);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
  const [usedArtistIds, setUsedArtistIds] = useState<Set<string>>(new Set());
  const [lastPick, setLastPick] = useState<LastPick | null>(null);

  const currentPlayer = players[currentPlayerIdx];
  const candidates = useMemo(
    () =>
      artists.filter(
        (a) => a.spotify_id == null || !usedArtistIds.has(a.spotify_id),
      ),
    [artists, usedArtistIds],
  );

  function startGame(initialPlayers: Player[], rounds: 3 | 5 | 10) {
    setPlayers(
      initialPlayers.map((p) => ({ ...p, score: 0, picks: [] })),
    );
    setTotalRounds(rounds);
    setCurrentRound(1);
    setCurrentPlayerIdx(0);
    setUsedArtistIds(new Set());
    setLastPick(null);
    setStatus("countdown");
    void trackEvent("passplay_start");
  }

  // Always consumes the turn: a miss (not in top 500) is recorded as a
  // null-match pick worth 0 points, same as solo play. Dedup is handled
  // by the `candidates` filter (already-picked artists aren't in scope for
  // fuzzyFind), so a typed duplicate naturally falls through to the miss
  // branch. Empty input is the only case that doesn't advance.
  function submitGuess(input: string): void {
    const trimmed = input.trim();
    if (!trimmed) return;
    const match = fuzzyFind(trimmed, candidates);
    const points = pointsForRank(match?.rank ?? null);
    const pick: Pick = {
      round: currentRound,
      input: trimmed,
      matched: match,
      points,
    };
    setPlayers((prev) =>
      prev.map((p, i) =>
        i === currentPlayerIdx
          ? { ...p, score: p.score + points, picks: [...p.picks, pick] }
          : p,
      ),
    );
    if (match?.spotify_id) {
      setUsedArtistIds((prev) => {
        const next = new Set(prev);
        next.add(match.spotify_id!);
        return next;
      });
    }
    setLastPick({
      playerName: currentPlayer.name,
      input: trimmed,
      matched: match,
      points,
    });
    setStatus("reveal");
  }

  // Called when the reveal screen's "Pass" button is clicked. Computes the
  // next turn / round / end-of-game transition.
  function advance() {
    const nextIdx = (currentPlayerIdx + 1) % players.length;
    const wrapped = nextIdx === 0;
    if (!wrapped) {
      setCurrentPlayerIdx(nextIdx);
      setStatus("countdown");
      return;
    }
    // Wrapped — round just ended.
    if (currentRound >= totalRounds) {
      setStatus("game_over");
      return;
    }
    setStatus("round_summary");
  }

  function continueToNextRound() {
    setCurrentRound((r) => r + 1);
    setCurrentPlayerIdx(0);
    setStatus("countdown");
  }

  function playAgain() {
    setPlayers((prev) => prev.map((p) => ({ ...p, score: 0, picks: [] })));
    setCurrentRound(1);
    setCurrentPlayerIdx(0);
    setUsedArtistIds(new Set());
    setLastPick(null);
    setStatus("countdown");
  }

  if (status === "setup") {
    return <SetupScreen onStart={startGame} />;
  }
  if (status === "countdown") {
    return (
      <CountdownScreen
        playerName={currentPlayer.name}
        round={currentRound}
        totalRounds={totalRounds}
        onDone={() => setStatus("guessing")}
      />
    );
  }
  if (status === "guessing") {
    return (
      <GuessScreen
        player={currentPlayer}
        round={currentRound}
        totalRounds={totalRounds}
        players={players}
        onSubmit={submitGuess}
      />
    );
  }
  if (status === "reveal" && lastPick) {
    const nextIdx = (currentPlayerIdx + 1) % players.length;
    const wrapped = nextIdx === 0;
    const isLastPick = wrapped && currentRound >= totalRounds;
    const isRoundEnd = wrapped && currentRound < totalRounds;
    const nextLabel = isLastPick
      ? "See results"
      : isRoundEnd
        ? `End round ${currentRound}`
        : `Pass to ${players[nextIdx].name}`;
    return (
      <RevealScreen
        pick={lastPick}
        snapshotDate={snapshotDate}
        nextLabel={nextLabel}
        onAdvance={advance}
      />
    );
  }
  if (status === "round_summary") {
    return (
      <RoundSummaryScreen
        players={players}
        round={currentRound}
        totalRounds={totalRounds}
        onContinue={continueToNextRound}
      />
    );
  }
  if (status === "game_over") {
    return (
      <GameOverScreen
        players={players}
        totalRounds={totalRounds}
        onPlayAgain={playAgain}
      />
    );
  }
  return null;
}

// ---------- Setup ----------

function SetupScreen({
  onStart,
}: {
  onStart: (players: Player[], rounds: 3 | 5 | 10) => void;
}) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [nameInput, setNameInput] = useState("");
  const [rounds, setRounds] = useState<3 | 5 | 10>(5);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function addPlayer() {
    const name = nameInput.trim().slice(0, 20);
    setError(null);
    if (!name) return;
    if (players.length >= MAX_PLAYERS) {
      setError(`Maximum ${MAX_PLAYERS} players.`);
      return;
    }
    if (
      players.some((p) => p.name.toLowerCase() === name.toLowerCase())
    ) {
      setError("Each player needs a unique name.");
      return;
    }
    setPlayers((prev) => [...prev, { id: rid(), name, score: 0, picks: [] }]);
    setNameInput("");
    inputRef.current?.focus();
  }

  function removePlayer(id: string) {
    setPlayers((prev) => prev.filter((p) => p.id !== id));
  }

  function canStart() {
    return players.length >= MIN_PLAYERS;
  }

  return (
    <main className="flex-1 flex flex-col px-5 sm:px-10 pt-32 pb-16">
      <div className="w-full max-w-2xl mx-auto">
        <Link
          href="/party"
          className="font-mono text-[11px] tracking-[2px] uppercase text-muted hover:text-foreground transition"
        >
          ← Party options
        </Link>

        <div className="mt-6 flex items-center gap-[10px] font-mono text-[11px] tracking-[3px] uppercase text-spotify font-medium">
          <span className="w-6 h-px bg-spotify" />
          Pass &amp; Play
        </div>
        <h1
          className="mt-2 font-display leading-none tracking-[2px] text-foreground"
          style={{ fontSize: "clamp(48px, 8vw, 96px)" }}
        >
          ADD YOUR
          <br />
          PLAYERS
        </h1>

        <div className="mt-10 bg-surface border border-border rounded-lg p-6">
          <div className="font-mono text-[11px] tracking-[2px] uppercase text-muted mb-3">
            Players ({players.length} / {MAX_PLAYERS})
          </div>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addPlayer();
                }
              }}
              placeholder="Player name"
              maxLength={20}
              disabled={players.length >= MAX_PLAYERS}
              className="focus-green flex-1 rounded-[4px] bg-background border border-border px-4 py-3 text-foreground placeholder:text-muted/60 transition disabled:opacity-50"
            />
            <button
              type="button"
              onClick={addPlayer}
              disabled={!nameInput.trim() || players.length >= MAX_PLAYERS}
              className="bg-spotify text-background font-bold text-[13px] tracking-[0.5px] px-5 py-3 rounded-[4px] transition hover:bg-spotify-bright disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
          {error && (
            <div className="font-mono text-[10px] tracking-[1px] uppercase text-red mt-3">
              {error}
            </div>
          )}

          {players.length > 0 && (
            <ol className="mt-4 space-y-[2px]">
              {players.map((p, i) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between bg-background border border-border rounded-[4px] px-4 py-2.5"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="font-display text-[20px] leading-none w-6 text-muted shrink-0">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="truncate text-foreground">{p.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removePlayer(p.id)}
                    className="font-mono text-[10px] tracking-[2px] uppercase text-muted hover:text-red transition shrink-0"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="mt-6 bg-surface border border-border rounded-lg p-6">
          <div className="font-mono text-[11px] tracking-[2px] uppercase text-muted mb-3">
            Rounds
          </div>
          <div className="flex gap-2">
            {ROUNDS_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRounds(r)}
                className={`flex-1 rounded-[4px] border px-5 py-3 font-display text-[24px] tracking-[2px] transition ${
                  rounds === r
                    ? "border-spotify text-spotify bg-spotify/5"
                    : "border-border text-foreground hover:border-foreground"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => canStart() && onStart(players, rounds)}
            disabled={!canStart()}
            className="flex-1 bg-spotify text-background font-bold text-[15px] tracking-[0.5px] px-8 py-4 rounded-[4px] transition hover:-translate-y-px hover:bg-spotify-bright disabled:opacity-50 disabled:translate-y-0 disabled:cursor-not-allowed"
          >
            {canStart()
              ? `Start game →`
              : `Need at least ${MIN_PLAYERS} players`}
          </button>
        </div>
      </div>
    </main>
  );
}

// ---------- Countdown ----------

function CountdownScreen({
  playerName,
  round,
  totalRounds,
  onDone,
}: {
  playerName: string;
  round: number;
  totalRounds: number;
  onDone: () => void;
}) {
  const [n, setN] = useState(3);

  useEffect(() => {
    if (n <= 0) {
      const t = setTimeout(onDone, 600);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setN(n - 1), 900);
    return () => clearTimeout(t);
  }, [n, onDone]);

  return (
    <main className="flex-1 flex items-center justify-center px-5 sm:px-10 pt-32 pb-16">
      <div className="text-center">
        <div className="font-mono text-[11px] tracking-[3px] uppercase text-spotify mb-4">
          Round {round} / {totalRounds}
        </div>
        <div className="font-mono text-[11px] tracking-[2px] uppercase text-muted mb-6">
          Pass the device to
        </div>
        <div
          className="font-display leading-none tracking-[2px] text-foreground mb-10"
          style={{ fontSize: "clamp(48px, 9vw, 96px)" }}
        >
          {playerName.toUpperCase()}
        </div>
        <div
          key={n}
          className="font-display leading-none text-spotify animate-countdown-pop"
          style={{ fontSize: "clamp(120px, 25vw, 240px)" }}
        >
          {n > 0 ? n : "GO"}
        </div>
      </div>
    </main>
  );
}

// ---------- Guessing ----------

function GuessScreen({
  player,
  round,
  totalRounds,
  players,
  onSubmit,
}: {
  player: Player;
  round: number;
  totalRounds: number;
  players: Player[];
  onSubmit: (input: string) => void;
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit() {
    onSubmit(input);
    // Parent transitions to reveal on any non-empty submit and this screen
    // unmounts. Empty input is a silent no-op — the parent returns early.
  }

  return (
    <main className="flex-1 flex flex-col px-5 sm:px-10 pt-32 pb-16">
      <div className="w-full max-w-3xl mx-auto">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="font-mono text-[11px] tracking-[3px] uppercase text-spotify mb-3 flex items-center gap-[10px]">
              <span className="w-6 h-px bg-spotify" />
              Round {round} / {totalRounds}
            </div>
            <div className="font-mono text-[11px] tracking-[2px] uppercase text-muted">
              Your turn
            </div>
            <h1
              className="font-display leading-none tracking-[2px] text-spotify mt-2"
              style={{ fontSize: "clamp(48px, 9vw, 96px)" }}
            >
              {player.name.toUpperCase()}
            </h1>
            <p className="text-muted mt-4 font-light max-w-md">
              Name an artist you think is in today&rsquo;s Spotify top 500.
              Score = their rank. Higher is better.
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono text-[11px] tracking-[3px] uppercase text-muted mb-2">
              Your score
            </div>
            <div className="font-display text-5xl sm:text-6xl leading-none text-foreground">
              {player.score}
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
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="e.g. Taylor Swift"
            className="focus-green w-full rounded-2xl bg-surface border border-border px-5 py-4 text-lg text-foreground placeholder:text-muted/60 transition"
          />
          <div className="font-mono text-[10px] tracking-[2px] uppercase text-muted mt-3">
            Press Enter to submit · spelling is forgiving · no retries
          </div>
        </div>

        <div className="mt-14">
          <div className="font-mono text-[11px] tracking-[3px] uppercase text-muted mb-4 flex items-center gap-[10px]">
            <span className="w-6 h-px bg-border" />
            Standings
          </div>
          <StandingsList players={players} highlightId={player.id} />
        </div>
      </div>
    </main>
  );
}

// ---------- Reveal ----------

function RevealScreen({
  pick,
  snapshotDate,
  nextLabel,
  onAdvance,
}: {
  pick: LastPick;
  snapshotDate: string;
  nextLabel: string;
  onAdvance: () => void;
}) {
  return (
    <main className="flex-1 flex items-center justify-center px-5 sm:px-10 pt-32 pb-16">
      <div className="w-full max-w-xl">
        <div className="bg-surface border border-border rounded-lg p-8 sm:p-10 text-center">
          <div className="font-mono text-[11px] tracking-[3px] uppercase text-muted mb-4">
            {pick.playerName} picked
          </div>
          {pick.matched && (
            <div className="flex justify-center mb-5 animate-modal-scale-in">
              <ArtistAvatar
                imageHash={pick.matched.image_hash}
                alt={pick.matched.artist_name}
                size={120}
              />
            </div>
          )}
          <div className="font-display tracking-[2px] text-foreground mb-6"
            style={{ fontSize: "clamp(32px, 6vw, 56px)" }}
          >
            {pick.matched ? pick.matched.artist_name.toUpperCase() : `"${pick.input}"`}
          </div>
          {pick.matched ? (
            <>
              <div className="font-mono text-[11px] tracking-[2px] uppercase text-muted mb-2">
                Rank
              </div>
              <div
                className="font-display leading-none text-foreground mb-6"
                style={{ fontSize: "clamp(80px, 16vw, 140px)" }}
              >
                #{pick.matched.rank}
              </div>
              <div className="font-mono text-[11px] tracking-[2px] uppercase text-spotify">
                +{pick.points} points
              </div>
            </>
          ) : (
            <div className="font-mono text-[11px] tracking-[2px] uppercase text-muted">
              Not in today&rsquo;s top 500 · +0
            </div>
          )}
          <div className="mt-6 font-mono text-[10px] tracking-[2px] uppercase text-muted/60">
            Snapshot {snapshotDate}
          </div>
        </div>
        <button
          type="button"
          onClick={onAdvance}
          className="mt-8 w-full bg-spotify text-background font-bold text-[15px] tracking-[0.5px] px-8 py-4 rounded-[4px] transition hover:-translate-y-px hover:bg-spotify-bright"
        >
          {nextLabel} →
        </button>
      </div>
    </main>
  );
}

// ---------- Round summary ----------

function RoundSummaryScreen({
  players,
  round,
  totalRounds,
  onContinue,
}: {
  players: Player[];
  round: number;
  totalRounds: number;
  onContinue: () => void;
}) {
  return (
    <main className="flex-1 flex items-center justify-center px-5 sm:px-10 pt-32 pb-16">
      <div className="w-full max-w-xl">
        <div className="text-center">
          <div className="font-mono text-[11px] tracking-[3px] uppercase text-spotify mb-3">
            End of round {round}
          </div>
          <h1
            className="font-display leading-none tracking-[2px] text-foreground"
            style={{ fontSize: "clamp(48px, 8vw, 80px)" }}
          >
            STANDINGS
          </h1>
        </div>

        <div className="mt-10">
          <StandingsList players={players} highlightId={null} showDelta />
        </div>

        <button
          type="button"
          onClick={onContinue}
          className="mt-10 w-full bg-spotify text-background font-bold text-[15px] tracking-[0.5px] px-8 py-4 rounded-[4px] transition hover:-translate-y-px hover:bg-spotify-bright"
        >
          Start round {round + 1} of {totalRounds} →
        </button>
      </div>
    </main>
  );
}

// ---------- Game over ----------

function GameOverScreen({
  players,
  totalRounds,
  onPlayAgain,
}: {
  players: Player[];
  totalRounds: number;
  onPlayAgain: () => void;
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  // Handle perfect-tie: if top two have the same score, show both names.
  const tiedWinners = sorted.filter((p) => p.score === winner.score);

  return (
    <main className="flex-1 flex items-center justify-center px-5 sm:px-10 pt-32 pb-16">
      <div className="w-full max-w-2xl">
        <div className="text-center">
          <div className="font-mono text-[11px] tracking-[3px] uppercase text-spotify mb-3">
            Party over · {totalRounds} rounds
          </div>
          <div className="font-mono text-[11px] tracking-[2px] uppercase text-muted mb-4">
            {tiedWinners.length > 1 ? "It's a tie" : "Winner"}
          </div>
          <div
            className="font-display leading-none tracking-[2px] text-spotify animate-winner"
            style={{ fontSize: "clamp(64px, 14vw, 160px)" }}
          >
            {tiedWinners.map((p) => p.name.toUpperCase()).join(" & ")}
          </div>
          <div className="font-display text-5xl sm:text-6xl text-foreground mt-4">
            {winner.score}
          </div>
          <div className="font-mono text-[11px] tracking-[2px] uppercase text-muted mt-1">
            points
          </div>
        </div>

        <div className="mt-10">
          <StandingsList players={players} highlightId={null} />
        </div>

        <div className="mt-10 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onPlayAgain}
            className="flex-1 bg-spotify text-background font-bold text-[15px] tracking-[0.5px] px-8 py-4 rounded-[4px] transition hover:-translate-y-px hover:bg-spotify-bright"
          >
            Play again
          </button>
          <Link
            href="/party"
            className="flex-1 bg-transparent text-foreground border border-border rounded-[4px] px-8 py-4 text-[15px] text-center hover:border-foreground transition"
          >
            End party
          </Link>
        </div>
      </div>
    </main>
  );
}

// ---------- Shared ----------

function StandingsList({
  players,
  highlightId,
  showDelta = false,
}: {
  players: Player[];
  highlightId: string | null;
  showDelta?: boolean;
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <ol className="bg-surface border border-border rounded-lg overflow-hidden">
      {sorted.map((p, i) => {
        const isHighlight = p.id === highlightId;
        const lastPickPoints =
          showDelta && p.picks.length > 0
            ? p.picks[p.picks.length - 1].points
            : null;
        return (
          <li
            key={p.id}
            className={`flex items-center gap-4 px-5 py-3 border-b border-border/60 last:border-b-0 ${isHighlight ? "bg-spotify/5" : ""}`}
          >
            <span
              className={`font-display text-[20px] leading-none w-10 shrink-0 ${i === 0 ? "text-spotify" : "text-muted"}`}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span
              className={`flex-1 truncate ${isHighlight ? "text-spotify font-medium" : "text-foreground"}`}
            >
              {p.name}
            </span>
            {lastPickPoints !== null && (
              <span className="font-mono text-[11px] tracking-[1px] text-muted">
                +{lastPickPoints}
              </span>
            )}
            <span className="font-display text-[20px] leading-none text-foreground">
              {p.score}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
