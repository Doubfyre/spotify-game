"use client";

// Thin gate in front of OnlineParty that handles guest play. Two cases:
//   1. User is signed in with a real account — pass through using their
//      email local-part as the display name and their auth.uid() as the
//      user_id (preserves old behaviour).
//   2. No account / guest — show a name-entry form, cache the name in
//      localStorage, generate (or reuse) a client-side UUID as a pseudo
//      user_id, pass through to OnlineParty. No Supabase auth session
//      is created; the RLS policies on party_rooms/players/picks are
//      wide-open and the room code is the only gate.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ArtistRow } from "@/lib/supabase";
import OnlineParty from "./OnlineParty";

const LS_NAME_KEY = "party-display-name";
const LS_GUEST_ID_KEY = "party-guest-id";
// Aligned with the leaderboard tables' DB-side check
// (`char_length(player_name) between 1 and 20`). Letting party names
// exceed 20 was bait for confusion: a 22-char name worked in the
// lobby but would silently truncate later when the player tried to
// post a leaderboard score under the same handle.
const MAX_NAME_LEN = 20;

type Props = {
  initialUserId: string | null;
  emailDisplayName: string | null;
  snapshotDate: string;
  artists: ArtistRow[];
};

export default function OnlinePartyEntry({
  initialUserId,
  emailDisplayName,
  snapshotDate,
  artists,
}: Props) {
  // If the server handed us a real signed-in user + email-derived name,
  // we're ready straight away. Otherwise we resolve a guest identity on
  // the client (localStorage name + guest UUID) before mounting the game.
  const serverReady = Boolean(initialUserId && emailDisplayName);

  const [userId, setUserId] = useState<string | null>(
    serverReady ? initialUserId : null,
  );
  const [displayName, setDisplayName] = useState<string | null>(
    serverReady ? emailDisplayName : null,
  );
  const [status, setStatus] = useState<"resolving" | "needs-name" | "ready">(
    serverReady ? "ready" : "resolving",
  );

  // Guards the resolve-on-mount effect against Strict Mode double-fire.
  const resolvedOnce = useRef(false);

  useEffect(() => {
    if (serverReady || resolvedOnce.current) return;
    resolvedOnce.current = true;

    const cachedName = readCachedName();
    if (!cachedName) {
      setStatus("needs-name");
      return;
    }
    // Name already cached on this device — reuse it and whatever guest
    // UUID is paired with it. First-time guests get a fresh UUID here.
    setUserId(getOrCreateGuestId());
    setDisplayName(cachedName);
    setStatus("ready");
  }, [serverReady]);

  function onSubmitName(name: string) {
    writeCachedName(name);
    setUserId(getOrCreateGuestId());
    setDisplayName(name);
    setStatus("ready");
  }

  if (status === "resolving") {
    return <Pending label="Loading..." />;
  }

  if (status === "needs-name") {
    return <NameForm onSubmit={onSubmitName} />;
  }

  // status === "ready"
  if (!userId || !displayName) {
    // Shouldn't hit — guarded by the status machine — but fail safe.
    return <Pending label="Loading..." />;
  }

  return (
    <OnlineParty
      userId={userId}
      displayName={displayName}
      snapshotDate={snapshotDate}
      artists={artists}
    />
  );
}

function readCachedName(): string | null {
  try {
    const raw = localStorage.getItem(LS_NAME_KEY);
    if (!raw) return null;
    const trimmed = raw.trim().slice(0, MAX_NAME_LEN);
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

function writeCachedName(name: string) {
  try {
    localStorage.setItem(LS_NAME_KEY, name);
  } catch {
    // localStorage disabled — the name lives in React state for the
    // duration of this tab, which is enough for a single party session.
  }
}

// Client-generated stable identity for guest players. Stored in
// localStorage so the same person returning to a room (e.g. after a
// refresh) is recognised by the room_code+user_id uniqueness key.
function getOrCreateGuestId(): string {
  try {
    const existing = localStorage.getItem(LS_GUEST_ID_KEY);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(LS_GUEST_ID_KEY, fresh);
    return fresh;
  } catch {
    // localStorage disabled — fresh UUID per call. They'll look like a
    // new person if they refresh mid-game; acceptable fallback.
    return crypto.randomUUID();
  }
}

function NameForm({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit() {
    const name = value.trim().slice(0, MAX_NAME_LEN);
    if (!name) return;
    onSubmit(name);
  }

  return (
    <main className="flex-1 flex items-center justify-center px-5 sm:px-10 pt-32 pb-16">
      <div className="w-full max-w-lg bg-surface border border-border rounded-lg p-8 sm:p-10">
        <div className="font-mono text-[11px] tracking-[3px] uppercase text-spotify mb-5 flex items-center gap-[10px]">
          <span className="w-6 h-px bg-spotify" />
          Party Mode
        </div>
        <h1
          className="font-display tracking-[2px] leading-[0.95] text-foreground mb-4"
          style={{ fontSize: "clamp(36px, 6vw, 56px)" }}
        >
          PICK A<br />
          DISPLAY NAME
        </h1>
        <p className="text-muted font-light leading-[1.7] mb-6">
          Other players will see this in the lobby and leaderboard. No sign-in
          needed — just pick a name and jump in.
        </p>
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          spellCheck={false}
          maxLength={MAX_NAME_LEN}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="e.g. Jack"
          aria-label="Display name"
          className="focus-green w-full rounded-[4px] bg-background border border-border px-5 py-4 text-lg text-foreground placeholder:text-muted/60 transition"
        />
        <div className="mt-3 font-mono text-[10px] tracking-[2px] uppercase text-muted">
          Saved on this device · Max {MAX_NAME_LEN} characters
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={value.trim().length === 0}
          className="mt-6 w-full bg-spotify text-background font-bold text-[15px] tracking-[0.5px] px-8 py-3.5 rounded-[4px] transition hover:-translate-y-px hover:bg-spotify-bright disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
        >
          Continue →
        </button>

        <div className="mt-6 text-center">
          <Link
            href="/signin?next=/party/online"
            className="font-mono text-[10px] tracking-[2px] uppercase text-muted hover:text-foreground transition"
          >
            Or sign in with email
          </Link>
        </div>
      </div>
    </main>
  );
}

function Pending({ label }: { label: string }) {
  return (
    <main className="flex-1 flex items-center justify-center px-5 sm:px-10 pt-32 pb-16">
      <div className="font-mono text-[11px] tracking-[3px] uppercase text-muted">
        {label}
      </div>
    </main>
  );
}
