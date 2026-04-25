"use client";

/**
 * Realtime-synced multiplayer party mode.
 *
 * Architecture (important to internalize before changing this file):
 *
 *   • Authoritative state lives in Supabase (party_rooms, party_players,
 *     party_picks). Clients are thin views over that state.
 *   • Every client subscribes to postgres_changes on the three tables,
 *     filtered by room code. On any change, the affected table is re-fetched
 *     (not merged from the payload — simpler and payloads are small).
 *   • Turn advancement is performed by whichever client *just submitted* a
 *     pick. We use conditional UPDATEs keyed on current_player_idx so two
 *     clients racing to advance won't double-advance.
 *   • The 30-second turn timer is enforced by the active player's own
 *     browser (via a setTimeout keyed on room.turn_started_at). If the
 *     active player's browser is offline, the game stalls until they come
 *     back. A Postgres job could fix this but is out of scope.
 *
 * RLS model: all `authenticated` users can read every row in these three
 * tables — we rely on 4-char room-code secrecy, not RLS. Fine for trusted
 * friends. Not fine for hostile or open-internet use cases.
 */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import ArtistAvatar from "@/app/_components/ArtistAvatar";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createBrowserSupabase } from "@/lib/supabase";
import type { ArtistRow } from "@/lib/supabase";
import { fuzzyFind } from "@/lib/fuzzy";
import { trackEvent } from "@/lib/tracking";

// ============================================================
// Types
// ============================================================

type RoomStatus = "lobby" | "active" | "finished";

type Room = {
  code: string;
  host_id: string;
  snapshot_date: string;
  total_rounds: 3 | 5 | 10;
  status: RoomStatus;
  current_round: number;
  current_player_idx: number;
  turn_started_at: string | null;
  created_at: string;
};

type PartyPlayer = {
  id: string;
  room_code: string;
  user_id: string;
  display_name: string;
  turn_order: number;
  score: number;
  joined_at: string;
};

type PartyPick = {
  id: string;
  room_code: string;
  player_id: string;
  round: number;
  input: string;
  spotify_id: string | null;
  artist_name: string | null;
  image_hash: string | null;
  rank: number | null;
  points: number;
  created_at: string;
};

// ============================================================
// Constants
// ============================================================

const TURN_SECONDS = 60;
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 2;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 4;

const TIPS = [
  "Which artists might be hanging around rank #500?",
  "Think deep cuts — the lowest-profile artist you still recognise often scores best.",
  "The obvious top-10 names score way less than you think.",
  "Artists who peaked a few years ago often sit mid-pack.",
  "Niche genres with loyal fanbases can surprise you.",
  "Non-English-speaking artists frequently hover near the edge.",
];

const ROUND_OPTIONS: Array<3 | 5 | 10> = [3, 5, 10];

// ============================================================
// Helpers
// ============================================================

function generateRoomCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

function pointsForRank(rank: number | null): number {
  if (rank === null || rank < 1 || rank > 500) return 0;
  return rank;
}

function pickTip(seed: string): string {
  // Stable tip per turn_started_at so everyone sees the same one.
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return TIPS[Math.abs(h) % TIPS.length];
}

// ============================================================
// Entry — wraps useSearchParams in Suspense
// ============================================================

type Props = {
  userId: string;
  displayName: string;
  snapshotDate: string;
  artists: ArtistRow[];
};

export default function OnlineParty(props: Props) {
  return (
    <Suspense fallback={<Shell>Loading…</Shell>}>
      <OnlinePartyInner {...props} />
    </Suspense>
  );
}

function OnlinePartyInner({
  userId,
  displayName,
  snapshotDate,
  artists,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const code = (searchParams.get("code") ?? "").toUpperCase() || null;

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<PartyPlayer[]>([]);
  const [picks, setPicks] = useState<PartyPick[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refetch helpers
  const reloadRoom = useCallback(
    async (forCode: string) => {
      const { data } = await supabase
        .from("party_rooms")
        .select("*")
        .eq("code", forCode)
        .maybeSingle();
      setRoom((data as Room | null) ?? null);
    },
    [supabase],
  );

  const reloadPlayers = useCallback(
    async (forCode: string) => {
      const { data } = await supabase
        .from("party_players")
        .select("*")
        .eq("room_code", forCode)
        .order("turn_order", { ascending: true });
      setPlayers((data as PartyPlayer[]) ?? []);
    },
    [supabase],
  );

  const reloadPicks = useCallback(
    async (forCode: string) => {
      const { data } = await supabase
        .from("party_picks")
        .select("*")
        .eq("room_code", forCode)
        .order("created_at", { ascending: true });
      setPicks((data as PartyPick[]) ?? []);
    },
    [supabase],
  );

  // Initial load + realtime subscription
  useEffect(() => {
    if (!code) {
      setRoom(null);
      setPlayers([]);
      setPicks([]);
      setInitialized(true);
      return;
    }
    setInitialized(false);
    let channel: RealtimeChannel | null = null;
    (async () => {
      await Promise.all([
        reloadRoom(code),
        reloadPlayers(code),
        reloadPicks(code),
      ]);
      setInitialized(true);

      channel = supabase
        .channel(`party:${code}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "party_rooms",
            filter: `code=eq.${code}`,
          },
          () => reloadRoom(code),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "party_players",
            filter: `room_code=eq.${code}`,
          },
          () => reloadPlayers(code),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "party_picks",
            filter: `room_code=eq.${code}`,
          },
          () => reloadPicks(code),
        )
        .subscribe();
    })();
    return () => {
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [code, supabase, reloadRoom, reloadPlayers, reloadPicks]);

  // Fire one online_start per OnlineParty mount the first time we see
  // this room transition into / arrive in the "active" state. Late-
  // joiners (joined after the host pressed start) also get tracked
  // because the trigger is "first observation of active", not the
  // lobby→active edge.
  const onlineStartFired = useRef(false);
  useEffect(() => {
    if (room?.status === "active" && !onlineStartFired.current) {
      onlineStartFired.current = true;
      void trackEvent("online_start");
    }
  }, [room?.status]);

  // Derived state
  const isHost = room !== null && room.host_id === userId;
  const myPlayer =
    players.find((p) => p.user_id === userId) ?? null;
  const currentPlayer =
    room !== null
      ? (players.find((p) => p.turn_order === room.current_player_idx) ?? null)
      : null;
  const isMyTurn =
    room?.status === "active" &&
    myPlayer !== null &&
    currentPlayer !== null &&
    myPlayer.id === currentPlayer.id;

  const usedSpotifyIds = useMemo(
    () =>
      new Set(
        picks
          .map((p) => p.spotify_id)
          .filter((id): id is string => typeof id === "string"),
      ),
    [picks],
  );
  const candidates = useMemo(
    () =>
      artists.filter(
        (a) => a.spotify_id == null || !usedSpotifyIds.has(a.spotify_id),
      ),
    [artists, usedSpotifyIds],
  );

  // ============================================================
  // Handlers
  // ============================================================

  async function handleCreateRoom() {
    setError(null);
    setSubmitting(true);
    // Retry a few times if we hit a code collision (primary-key violation).
    let newCode: string | null = null;
    for (let i = 0; i < 5; i++) {
      const candidate = generateRoomCode();
      const { error: insertErr } = await supabase
        .from("party_rooms")
        .insert({
          code: candidate,
          host_id: userId,
          snapshot_date: snapshotDate,
          total_rounds: 5,
          status: "lobby",
          current_round: 0,
          current_player_idx: 0,
        });
      if (!insertErr) {
        newCode = candidate;
        break;
      }
      if (insertErr.code !== "23505") {
        // Not a unique-violation — real error
        setSubmitting(false);
        setError(insertErr.message);
        return;
      }
    }
    if (!newCode) {
      setSubmitting(false);
      setError("Couldn't pick an unused room code. Try again.");
      return;
    }
    const { error: joinErr } = await supabase.from("party_players").insert({
      room_code: newCode,
      user_id: userId,
      display_name: displayName,
      turn_order: 0,
      score: 0,
    });
    if (joinErr) {
      setSubmitting(false);
      setError(joinErr.message);
      return;
    }
    setSubmitting(false);
    router.replace(`/party/online?code=${newCode}`);
  }

  async function handleJoinRoom(inputCode: string) {
    setError(null);
    const clean = inputCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(clean)) {
      setError("Room codes are 4 letters or numbers.");
      return;
    }
    setSubmitting(true);
    const { data: roomRow, error: roomErr } = await supabase
      .from("party_rooms")
      .select("*")
      .eq("code", clean)
      .maybeSingle();
    if (roomErr || !roomRow) {
      setSubmitting(false);
      setError("Room not found.");
      return;
    }
    const r = roomRow as Room;
    if (r.status !== "lobby") {
      setSubmitting(false);
      setError("That game has already started.");
      return;
    }
    const { data: existing } = await supabase
      .from("party_players")
      .select("id, user_id, turn_order")
      .eq("room_code", clean);
    const list = (existing ?? []) as Array<Pick<PartyPlayer, "id" | "user_id" | "turn_order">>;
    if (list.length >= MAX_PLAYERS) {
      setSubmitting(false);
      setError("That room is full.");
      return;
    }
    const alreadyIn = list.some((p) => p.user_id === userId);
    if (!alreadyIn) {
      const nextOrder = list.reduce((m, p) => Math.max(m, p.turn_order), -1) + 1;
      const { error: insertErr } = await supabase.from("party_players").insert({
        room_code: clean,
        user_id: userId,
        display_name: displayName,
        turn_order: nextOrder,
        score: 0,
      });
      if (insertErr) {
        setSubmitting(false);
        setError(insertErr.message);
        return;
      }
    }
    setSubmitting(false);
    router.replace(`/party/online?code=${clean}`);
  }

  async function handleStart(totalRounds: 3 | 5 | 10) {
    if (!room || !isHost) return;
    if (players.length < MIN_PLAYERS) return;
    setError(null);
    const { error } = await supabase
      .from("party_rooms")
      .update({
        status: "active",
        total_rounds: totalRounds,
        current_round: 1,
        current_player_idx: 0,
        turn_started_at: new Date().toISOString(),
      })
      .eq("code", room.code);
    if (error) setError(error.message);
  }

  // Always consumes the turn: a miss (artist not in today's top 500) is
  // recorded as a null-match pick worth 0 points — same as solo/passplay.
  // Duplicates are silently excluded via the `candidates` filter above;
  // a typed dup falls through to the miss branch. Empty input and
  // not-your-turn are the only retryable errors.
  async function handleSubmitGuess(input: string): Promise<{ error?: string }> {
    if (!room || !myPlayer || !isMyTurn) return { error: "Not your turn." };
    const trimmed = input.trim();
    if (!trimmed) return { error: "Type an artist name first." };
    const match = fuzzyFind(trimmed, candidates);
    const points = pointsForRank(match?.rank ?? null);
    await recordAndAdvance(room, myPlayer, {
      input: trimmed,
      spotify_id: match?.spotify_id ?? null,
      artist_name: match?.artist_name ?? null,
      image_hash: match?.image_hash ?? null,
      rank: match?.rank ?? null,
      points,
    });
    return {};
  }

  // Auto-fail: submit a 0-point "timeout" pick for the active player.
  const autoFailRef = useRef(false);
  async function handleAutoFail() {
    if (autoFailRef.current) return;
    if (!room || !myPlayer || !isMyTurn) return;
    autoFailRef.current = true;
    await recordAndAdvance(room, myPlayer, {
      input: "",
      spotify_id: null,
      artist_name: null,
      image_hash: null,
      rank: null,
      points: 0,
    });
  }

  async function recordAndAdvance(
    r: Room,
    p: PartyPlayer,
    payload: {
      input: string;
      spotify_id: string | null;
      artist_name: string | null;
      image_hash: string | null;
      rank: number | null;
      points: number;
    },
  ) {
    setSubmitting(true);
    // Insert pick (unique constraint on (room, player, round) makes this idempotent)
    await supabase.from("party_picks").insert({
      room_code: r.code,
      player_id: p.id,
      round: r.current_round,
      ...payload,
    });
    // Update score
    if (payload.points > 0) {
      await supabase
        .from("party_players")
        .update({ score: p.score + payload.points })
        .eq("id", p.id);
    }
    // Advance turn. Conditional UPDATE keyed on current_player_idx to avoid
    // double-advance if two clients somehow race.
    const nextIdx = (r.current_player_idx + 1) % players.length;
    const wrapped = nextIdx === 0;
    const nextRound = wrapped ? r.current_round + 1 : r.current_round;
    const gameOver = wrapped && nextRound > r.total_rounds;
    await supabase
      .from("party_rooms")
      .update(
        gameOver
          ? {
              status: "finished",
              turn_started_at: null,
            }
          : {
              current_round: nextRound,
              current_player_idx: nextIdx,
              turn_started_at: new Date().toISOString(),
            },
      )
      .eq("code", r.code)
      .eq("current_player_idx", r.current_player_idx)
      .eq("current_round", r.current_round);
    setSubmitting(false);
    autoFailRef.current = false;
  }

  async function handlePlayAgain() {
    if (!room || !isHost) return;
    setError(null);
    await supabase.from("party_picks").delete().eq("room_code", room.code);
    await supabase
      .from("party_players")
      .update({ score: 0 })
      .eq("room_code", room.code);
    await supabase
      .from("party_rooms")
      .update({
        status: "lobby",
        current_round: 0,
        current_player_idx: 0,
        turn_started_at: null,
      })
      .eq("code", room.code);
  }

  async function handleEndParty() {
    if (!room || !isHost) return;
    await supabase.from("party_rooms").delete().eq("code", room.code);
    router.replace("/party/online");
  }

  async function handleLeaveRoom() {
    if (!room) return;
    if (isHost) {
      await supabase.from("party_rooms").delete().eq("code", room.code);
    } else if (myPlayer) {
      await supabase.from("party_players").delete().eq("id", myPlayer.id);
    }
    router.replace("/party/online");
  }

  // ============================================================
  // Render
  // ============================================================

  if (!code) {
    return (
      <CreateJoinScreen
        onCreate={handleCreateRoom}
        onJoin={handleJoinRoom}
        submitting={submitting}
        error={error}
      />
    );
  }

  if (!initialized) {
    return <Shell>Loading room…</Shell>;
  }

  if (!room) {
    return <NotFoundScreen code={code} />;
  }

  // If user navigated to ?code=X without ever joining, auto-insert them
  // if room is still in lobby (handles bookmarking / shared link).
  if (room.status === "lobby" && !myPlayer && players.length < MAX_PLAYERS) {
    return (
      <AutoJoinScreen
        code={code}
        onJoin={() => handleJoinRoom(code)}
        onCancel={() => router.replace("/party/online")}
      />
    );
  }
  if (!myPlayer) {
    // Game in progress or room full and we're not in it — kick back
    return (
      <NotFoundScreen
        code={code}
        message="That game is in progress or full. Ask the host for a new invite."
      />
    );
  }

  if (room.status === "lobby") {
    return (
      <LobbyScreen
        room={room}
        players={players}
        me={myPlayer}
        isHost={isHost}
        onStart={handleStart}
        onLeave={handleLeaveRoom}
        error={error}
      />
    );
  }

  if (room.status === "active") {
    return (
      <ActiveScreen
        room={room}
        players={players}
        picks={picks}
        me={myPlayer}
        isMyTurn={isMyTurn}
        currentPlayer={currentPlayer}
        submitting={submitting}
        onSubmitGuess={handleSubmitGuess}
        onAutoFail={handleAutoFail}
        onLeave={handleLeaveRoom}
      />
    );
  }

  // finished
  return (
    <EndScreen
      room={room}
      players={players}
      picks={picks}
      me={myPlayer}
      isHost={isHost}
      onPlayAgain={handlePlayAgain}
      onEndParty={handleEndParty}
      onLeave={handleLeaveRoom}
    />
  );
}

// ============================================================
// Screens
// ============================================================

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 flex items-center justify-center px-5 sm:px-10 pt-32 pb-16">
      <div className="font-mono text-[11px] tracking-[2px] uppercase text-muted">
        {children}
      </div>
    </main>
  );
}

function CreateJoinScreen({
  onCreate,
  onJoin,
  submitting,
  error,
}: {
  onCreate: () => void;
  onJoin: (code: string) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [joinCode, setJoinCode] = useState("");

  return (
    <main className="flex-1 flex flex-col px-5 sm:px-10 pt-32 pb-16">
      <div className="w-full max-w-xl mx-auto">
        <Link
          href="/party"
          className="font-mono text-[11px] tracking-[2px] uppercase text-muted hover:text-foreground transition"
        >
          ← Party options
        </Link>

        <div className="mt-6 flex items-center gap-[10px] font-mono text-[11px] tracking-[3px] uppercase text-spotify font-medium">
          <span className="w-6 h-px bg-spotify" />
          Online Play
        </div>
        <h1
          className="mt-2 font-display leading-none tracking-[2px] text-foreground"
          style={{ fontSize: "clamp(48px, 8vw, 96px)" }}
        >
          HOST OR
          <br />
          JOIN
        </h1>

        <div className="mt-10 bg-surface border border-border rounded-lg p-6 sm:p-8">
          <div className="font-mono text-[11px] tracking-[2px] uppercase text-muted mb-4">
            Host a new room
          </div>
          <button
            type="button"
            onClick={onCreate}
            disabled={submitting}
            className="w-full bg-spotify text-background font-bold text-[15px] tracking-[0.5px] px-8 py-4 rounded-[4px] transition hover:-translate-y-px hover:bg-spotify-bright disabled:opacity-50 disabled:translate-y-0"
          >
            {submitting ? "Creating…" : "Create room →"}
          </button>
        </div>

        <div className="mt-6 bg-surface border border-border rounded-lg p-6 sm:p-8">
          <div className="font-mono text-[11px] tracking-[2px] uppercase text-muted mb-4">
            Have a code?
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onJoin(joinCode);
                }
              }}
              placeholder="ABCD"
              maxLength={4}
              className="focus-green flex-1 rounded-[4px] bg-background border border-border px-4 py-3 font-display text-[32px] tracking-[8px] text-center text-foreground placeholder:text-muted/40 uppercase transition"
            />
            <button
              type="button"
              onClick={() => onJoin(joinCode)}
              disabled={submitting || joinCode.length !== 4}
              className="bg-foreground text-background font-bold text-[13px] tracking-[0.5px] px-5 py-3 rounded-[4px] transition hover:bg-spotify hover:text-background disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Join
            </button>
          </div>
        </div>

        {error && (
          <div className="font-mono text-[11px] tracking-[1px] uppercase text-red mt-5">
            {error}
          </div>
        )}
      </div>
    </main>
  );
}

function AutoJoinScreen({
  code,
  onJoin,
  onCancel,
}: {
  code: string;
  onJoin: () => void;
  onCancel: () => void;
}) {
  return (
    <main className="flex-1 flex items-center justify-center px-5 sm:px-10 pt-32 pb-16">
      <div className="w-full max-w-md bg-surface border border-border rounded-lg p-8 text-center">
        <div className="font-mono text-[11px] tracking-[3px] uppercase text-muted mb-3">
          Room
        </div>
        <div className="font-display text-[52px] leading-none tracking-[10px] text-foreground mb-6">
          {code}
        </div>
        <p className="text-muted mb-6 text-sm">
          You&rsquo;re not in this room yet. Join to enter the lobby.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onJoin}
            className="flex-1 bg-spotify text-background font-bold text-[14px] tracking-[0.5px] px-6 py-3 rounded-[4px] hover:bg-spotify-bright transition"
          >
            Join room
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 border border-border text-foreground rounded-[4px] px-6 py-3 text-[14px] hover:border-foreground transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </main>
  );
}

function NotFoundScreen({
  code,
  message,
}: {
  code: string;
  message?: string;
}) {
  return (
    <main className="flex-1 flex items-center justify-center px-5 sm:px-10 pt-32 pb-16">
      <div className="w-full max-w-md bg-surface border border-border rounded-lg p-8 text-center">
        <div className="font-mono text-[11px] tracking-[3px] uppercase text-muted mb-3">
          Room
        </div>
        <div className="font-display text-[52px] leading-none tracking-[10px] text-foreground mb-6">
          {code}
        </div>
        <p className="text-muted mb-6 text-sm">
          {message ?? "That room doesn't exist."}
        </p>
        <Link
          href="/party/online"
          className="inline-block bg-spotify text-background font-bold text-[14px] tracking-[0.5px] px-6 py-3 rounded-[4px] hover:bg-spotify-bright transition"
        >
          Host a new room
        </Link>
      </div>
    </main>
  );
}

function LobbyScreen({
  room,
  players,
  me,
  isHost,
  onStart,
  onLeave,
  error,
}: {
  room: Room;
  players: PartyPlayer[];
  me: PartyPlayer;
  isHost: boolean;
  onStart: (totalRounds: 3 | 5 | 10) => void;
  onLeave: () => void;
  error: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [rounds, setRounds] = useState<3 | 5 | 10>(5);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
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

        <div className="mt-10 bg-surface border border-border rounded-lg p-8 sm:p-10 text-center">
          <div className="font-mono text-[11px] tracking-[3px] uppercase text-muted mb-3">
            Room code
          </div>
          <div
            className="font-display leading-none tracking-[12px] text-foreground"
            style={{ fontSize: "clamp(56px, 14vw, 96px)" }}
          >
            {room.code}
          </div>
          <button
            type="button"
            onClick={copyCode}
            className="mt-4 font-mono text-[11px] tracking-[2px] uppercase text-muted hover:text-spotify transition"
          >
            {copied ? "Copied" : "Tap to copy"}
          </button>
        </div>

        <div className="mt-6 bg-surface border border-border rounded-lg p-6">
          <div className="flex items-baseline justify-between mb-4">
            <div className="font-mono text-[11px] tracking-[2px] uppercase text-spotify">
              Players ({players.length} / {MAX_PLAYERS})
            </div>
            <div className="font-mono text-[10px] tracking-[2px] uppercase text-muted">
              Need {MIN_PLAYERS}+ to start
            </div>
          </div>
          <ol className="space-y-[2px]">
            {players.map((p, i) => (
              <li
                key={p.id}
                className={`flex items-center justify-between bg-background border border-border rounded-[4px] px-4 py-2.5 ${p.id === me.id ? "border-spotify/40" : ""}`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <span className="font-display text-[20px] leading-none w-6 text-muted shrink-0">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={`truncate ${p.user_id === room.host_id ? "text-spotify font-medium" : "text-foreground"}`}
                  >
                    {p.display_name}
                  </span>
                  {p.user_id === room.host_id && (
                    <span className="font-mono text-[10px] tracking-[2px] uppercase text-spotify shrink-0">
                      Host
                    </span>
                  )}
                  {p.id === me.id && (
                    <span className="font-mono text-[10px] tracking-[2px] uppercase text-muted shrink-0">
                      You
                    </span>
                  )}
                </div>
              </li>
            ))}
            {Array.from({ length: Math.max(0, MIN_PLAYERS - players.length) }).map((_, i) => (
              <li
                key={`slot-${i}`}
                className="flex items-center gap-4 bg-background/50 border border-dashed border-border/60 rounded-[4px] px-4 py-2.5 text-muted"
              >
                <span className="font-display text-[20px] leading-none w-6 shrink-0">
                  {String(players.length + i + 1).padStart(2, "0")}
                </span>
                <span className="font-mono text-[11px] tracking-[2px] uppercase">
                  Waiting for players…
                </span>
              </li>
            ))}
          </ol>
        </div>

        {isHost && (
          <>
            <div className="mt-6 bg-surface border border-border rounded-lg p-6">
              <div className="font-mono text-[11px] tracking-[2px] uppercase text-muted mb-3">
                Rounds
              </div>
              <div className="flex gap-2">
                {ROUND_OPTIONS.map((r) => (
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
            <button
              type="button"
              onClick={() => onStart(rounds)}
              disabled={players.length < MIN_PLAYERS}
              className="mt-6 w-full bg-spotify text-background font-bold text-[15px] tracking-[0.5px] px-8 py-4 rounded-[4px] transition hover:-translate-y-px hover:bg-spotify-bright disabled:opacity-50 disabled:translate-y-0"
            >
              Start game →
            </button>
          </>
        )}
        {!isHost && (
          <div className="mt-6 bg-surface/50 border border-dashed border-border rounded-lg p-5 font-mono text-[11px] tracking-[2px] uppercase text-muted text-center">
            Waiting for host to start the game…
          </div>
        )}

        <button
          type="button"
          onClick={onLeave}
          className="mt-6 font-mono text-[11px] tracking-[2px] uppercase text-muted hover:text-red transition"
        >
          {isHost ? "Cancel room" : "Leave room"}
        </button>

        {error && (
          <div className="font-mono text-[11px] tracking-[1px] uppercase text-red mt-4">
            {error}
          </div>
        )}
      </div>
    </main>
  );
}

function ActiveScreen({
  room,
  players,
  picks,
  me,
  isMyTurn,
  currentPlayer,
  submitting,
  onSubmitGuess,
  onAutoFail,
  onLeave,
}: {
  room: Room;
  players: PartyPlayer[];
  picks: PartyPick[];
  me: PartyPlayer;
  isMyTurn: boolean;
  currentPlayer: PartyPlayer | null;
  submitting: boolean;
  onSubmitGuess: (input: string) => Promise<{ error?: string }>;
  onAutoFail: () => void;
  onLeave: () => void;
}) {
  const [input, setInput] = useState("");
  const [turnError, setTurnError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-fail timer (only runs on the active player's client).
  useEffect(() => {
    if (!isMyTurn || !room.turn_started_at) return;
    const deadline =
      new Date(room.turn_started_at).getTime() + TURN_SECONDS * 1000;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      onAutoFail();
      return;
    }
    const id = setTimeout(() => onAutoFail(), remaining);
    return () => clearTimeout(id);
  }, [isMyTurn, room.turn_started_at, onAutoFail]);

  // Clear the input when the turn changes.
  useEffect(() => {
    setInput("");
    setTurnError(null);
  }, [room.current_player_idx, room.current_round]);

  async function handleSubmit() {
    if (!isMyTurn) return;
    const result = await onSubmitGuess(input);
    if (result.error) {
      setTurnError(result.error);
      setInput("");
      inputRef.current?.focus();
    }
  }

  const lastPick = picks.length > 0 ? picks[picks.length - 1] : null;
  const lastPickPlayer = lastPick
    ? players.find((p) => p.id === lastPick.player_id)
    : null;
  const tip = pickTip(room.turn_started_at ?? "");

  return (
    <main className="flex-1 flex flex-col px-5 sm:px-10 pt-32 pb-16">
      <div className="w-full max-w-3xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="font-mono text-[11px] tracking-[2px] uppercase text-muted">
            Room <span className="text-foreground">{room.code}</span>
          </div>
          <button
            type="button"
            onClick={onLeave}
            className="font-mono text-[11px] tracking-[2px] uppercase text-muted hover:text-red transition"
          >
            Leave
          </button>
        </div>

        <div className="mt-6 flex items-start justify-between gap-6">
          <div>
            <div className="font-mono text-[11px] tracking-[3px] uppercase text-spotify mb-3 flex items-center gap-[10px]">
              <span className="w-6 h-px bg-spotify" />
              Round {room.current_round} / {room.total_rounds}
            </div>
            {isMyTurn ? (
              <>
                <div className="font-mono text-[11px] tracking-[2px] uppercase text-muted">
                  Your turn
                </div>
                <h1
                  className="font-display leading-none tracking-[2px] text-spotify mt-2"
                  style={{ fontSize: "clamp(48px, 9vw, 88px)" }}
                >
                  NAME AN
                  <br />
                  ARTIST
                </h1>
              </>
            ) : (
              <>
                <div className="font-mono text-[11px] tracking-[2px] uppercase text-muted">
                  Current guess
                </div>
                <h1
                  className="font-display leading-none tracking-[2px] text-foreground mt-2"
                  style={{ fontSize: "clamp(40px, 8vw, 72px)" }}
                >
                  {currentPlayer
                    ? `${currentPlayer.display_name.toUpperCase()} IS THINKING…`
                    : "WAITING…"}
                </h1>
              </>
            )}
          </div>
          <Timer startedAt={room.turn_started_at} />
        </div>

        {isMyTurn ? (
          <div className="mt-8">
            <input
              ref={inputRef}
              type="text"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (turnError) setTurnError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!submitting) handleSubmit();
                }
              }}
              disabled={submitting}
              placeholder="e.g. Taylor Swift"
              className="focus-green w-full rounded-2xl bg-surface border border-border px-5 py-4 text-lg text-foreground placeholder:text-muted/60 transition disabled:opacity-60"
            />
            {turnError ? (
              <div className="font-mono text-[10px] tracking-[2px] uppercase text-red mt-3">
                {turnError}
              </div>
            ) : (
              <div className="font-mono text-[10px] tracking-[2px] uppercase text-muted mt-3">
                Press Enter · 60 seconds per turn · spelling is forgiving
              </div>
            )}
          </div>
        ) : (
          <div className="mt-8 bg-surface border border-dashed border-border rounded-lg p-6">
            <div className="font-mono text-[10px] tracking-[2px] uppercase text-muted mb-2">
              Tip while you wait
            </div>
            <div className="text-foreground">{tip}</div>
          </div>
        )}

        {lastPick && lastPickPlayer && (
          <LastPickCard pick={lastPick} playerName={lastPickPlayer.display_name} />
        )}

        <div className="mt-12">
          <div className="font-mono text-[11px] tracking-[3px] uppercase text-muted mb-4 flex items-center gap-[10px]">
            <span className="w-6 h-px bg-border" />
            Live standings
          </div>
          <Standings players={players} activePlayerId={currentPlayer?.id ?? null} meId={me.id} />
        </div>
      </div>
    </main>
  );
}

function Timer({ startedAt }: { startedAt: string | null }) {
  const [seconds, setSeconds] = useState(TURN_SECONDS);

  useEffect(() => {
    if (!startedAt) {
      setSeconds(TURN_SECONDS);
      return;
    }
    const start = new Date(startedAt).getTime();
    const tick = () => {
      const elapsed = (Date.now() - start) / 1000;
      setSeconds(Math.max(0, Math.ceil(TURN_SECONDS - elapsed)));
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [startedAt]);

  const warn = seconds <= 10;
  return (
    <div className="text-right shrink-0">
      <div className="font-mono text-[11px] tracking-[3px] uppercase text-muted mb-2">
        Time
      </div>
      <div
        className={`font-display leading-none tabular-nums ${warn ? "text-red" : "text-foreground"}`}
        style={{ fontSize: "clamp(48px, 9vw, 80px)" }}
      >
        {seconds}
      </div>
    </div>
  );
}

function LastPickCard({
  pick,
  playerName,
}: {
  pick: PartyPick;
  playerName: string;
}) {
  return (
    <div
      // key on pick.id replays the reveal animation each time a new pick
      // streams in over realtime.
      key={pick.id}
      className="mt-6 bg-surface border border-border rounded-lg p-6 text-center animate-modal-scale-in"
    >
      <div className="font-mono text-[10px] tracking-[2px] uppercase text-muted">
        {playerName} picked
      </div>
      {pick.artist_name && (
        <div className="flex justify-center mt-4 mb-4">
          <ArtistAvatar
            imageHash={pick.image_hash}
            alt={pick.artist_name}
            size={120}
          />
        </div>
      )}
      <div className="text-foreground font-medium text-lg mt-3">
        {pick.artist_name ?? `"${pick.input}"`}
      </div>
      <div className="flex items-center justify-center gap-4 mt-3">
        {pick.rank !== null ? (
          <span className="font-mono text-[11px] text-muted">
            Rank #{pick.rank}
          </span>
        ) : (
          <span className="font-mono text-[11px] tracking-[2px] uppercase text-muted">
            Not in top 500
          </span>
        )}
        <span
          className={`font-display text-[26px] leading-none ${pick.points > 0 ? "text-spotify" : "text-muted"}`}
        >
          +{pick.points}
        </span>
      </div>
    </div>
  );
}

function Standings({
  players,
  activePlayerId,
  meId,
}: {
  players: PartyPlayer[];
  activePlayerId: string | null;
  meId: string;
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <ol className="bg-surface border border-border rounded-lg overflow-hidden">
      {sorted.map((p, i) => {
        const isMe = p.id === meId;
        const isActive = p.id === activePlayerId;
        return (
          <li
            key={p.id}
            className={`flex items-center gap-4 px-5 py-3 border-b border-border/60 last:border-b-0 ${isMe ? "bg-spotify/5" : ""}`}
          >
            <span
              className={`font-display text-[20px] leading-none w-10 shrink-0 ${i === 0 ? "text-spotify" : "text-muted"}`}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span
              className={`flex-1 truncate ${isMe ? "text-spotify font-medium" : "text-foreground"}`}
            >
              {p.display_name}
              {isActive && (
                <span className="ml-3 font-mono text-[10px] tracking-[2px] uppercase text-spotify">
                  • turn
                </span>
              )}
            </span>
            <span className="font-display text-[20px] leading-none text-foreground">
              {p.score}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function EndScreen({
  room,
  players,
  me,
  isHost,
  onPlayAgain,
  onEndParty,
  onLeave,
}: {
  room: Room;
  players: PartyPlayer[];
  picks: PartyPick[];
  me: PartyPlayer;
  isHost: boolean;
  onPlayAgain: () => void;
  onEndParty: () => void;
  onLeave: () => void;
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  const tiedWinners = sorted.filter((p) => p.score === winner.score);

  return (
    <main className="flex-1 flex items-center justify-center px-5 sm:px-10 pt-32 pb-16">
      <div className="w-full max-w-2xl">
        <div className="text-center">
          <div className="font-mono text-[11px] tracking-[3px] uppercase text-spotify mb-3">
            Party over · {room.total_rounds} rounds
          </div>
          <div className="font-mono text-[11px] tracking-[2px] uppercase text-muted mb-4">
            {tiedWinners.length > 1 ? "It's a tie" : "Winner"}
          </div>
          <div
            className="font-display leading-none tracking-[2px] text-spotify animate-winner"
            style={{ fontSize: "clamp(56px, 12vw, 140px)" }}
          >
            {tiedWinners.map((p) => p.display_name.toUpperCase()).join(" & ")}
          </div>
          <div className="font-display text-5xl sm:text-6xl text-foreground mt-4">
            {winner.score}
          </div>
          <div className="font-mono text-[11px] tracking-[2px] uppercase text-muted mt-1">
            points
          </div>
        </div>

        <div className="mt-10">
          <Standings players={players} activePlayerId={null} meId={me.id} />
        </div>

        <div className="mt-10 flex flex-col sm:flex-row gap-3">
          {isHost ? (
            <>
              <button
                type="button"
                onClick={onPlayAgain}
                className="flex-1 bg-spotify text-background font-bold text-[15px] tracking-[0.5px] px-8 py-4 rounded-[4px] transition hover:-translate-y-px hover:bg-spotify-bright"
              >
                Play again (same room)
              </button>
              <button
                type="button"
                onClick={onEndParty}
                className="flex-1 bg-transparent text-foreground border border-border rounded-[4px] px-8 py-4 text-[15px] text-center hover:border-foreground transition"
              >
                End party
              </button>
            </>
          ) : (
            <>
              <div className="flex-1 bg-surface/50 border border-dashed border-border rounded-[4px] px-8 py-4 font-mono text-[11px] tracking-[2px] uppercase text-muted text-center">
                Waiting for host…
              </div>
              <button
                type="button"
                onClick={onLeave}
                className="bg-transparent text-foreground border border-border rounded-[4px] px-8 py-4 text-[15px] text-center hover:border-foreground transition"
              >
                Leave
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
