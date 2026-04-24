"use client";

// Thin gate in front of OnlineParty that handles guest play. Three cases:
//   1. User is signed in with a real account — pass through using their
//      email local-part as the display name (preserves old behaviour).
//   2. User already has an anonymous Supabase session from a previous
//      visit — read their cached name from localStorage and pass through.
//      If localStorage is missing the name (e.g. cleared), re-prompt.
//   3. No session at all — show a name-entry form, cache the name, mint
//      an anonymous session via auth.signInAnonymously(), then pass
//      through to OnlineParty with the anon user id + chosen name.
//
// Anonymous users are still in the `authenticated` Postgres role, so the
// RLS policies on party_rooms/players/picks work unchanged.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { ArtistRow } from "@/lib/supabase";
import OnlineParty from "./OnlineParty";

const LS_NAME_KEY = "party-display-name";
const MAX_NAME_LEN = 24;

type Props = {
  initialUserId: string | null;
  initialIsAnonymous: boolean;
  emailDisplayName: string | null;
  snapshotDate: string;
  artists: ArtistRow[];
};

export default function OnlinePartyEntry({
  initialUserId,
  initialIsAnonymous,
  emailDisplayName,
  snapshotDate,
  artists,
}: Props) {
  // If we already know an email-based name from the server render, we can
  // start in the "ready" state and skip all client resolution.
  const ready = Boolean(initialUserId && emailDisplayName);

  const [userId, setUserId] = useState<string | null>(
    ready ? initialUserId : null,
  );
  const [displayName, setDisplayName] = useState<string | null>(
    ready ? emailDisplayName : null,
  );
  const [status, setStatus] = useState<
    "resolving" | "needs-name" | "signing-in" | "ready" | "error"
  >(ready ? "ready" : "resolving");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Guards against the resolve-on-mount effect firing twice in dev
  // (Strict Mode) and double-invoking signInAnonymously.
  const resolvedOnce = useRef(false);

  useEffect(() => {
    if (ready || resolvedOnce.current) return;
    resolvedOnce.current = true;

    // Case 2: returning anonymous user. Session exists; look up the name.
    if (initialUserId && initialIsAnonymous) {
      const cached = readCachedName();
      if (cached) {
        setUserId(initialUserId);
        setDisplayName(cached);
        setStatus("ready");
        return;
      }
      // Anon session but no name cached — treat as first-time entry.
      // We'll reuse the existing anon session rather than minting another.
      setStatus("needs-name");
      return;
    }

    // Case 3: no session. If a name is cached from a prior device session,
    // silently mint an anon account. Otherwise ask for the name first.
    const cached = readCachedName();
    if (cached) {
      void startAnonSession(cached);
    } else {
      setStatus("needs-name");
    }
  }, [ready, initialUserId, initialIsAnonymous]);

  async function startAnonSession(name: string) {
    setStatus("signing-in");
    setErrorMsg(null);
    try {
      const supa = createBrowserSupabase();

      // If we got here with an existing anon session (case 2 with no
      // cached name), reuse it rather than creating a second anon user.
      const {
        data: { user: existing },
      } = await supa.auth.getUser();
      if (existing) {
        writeCachedName(name);
        setUserId(existing.id);
        setDisplayName(name);
        setStatus("ready");
        return;
      }

      const { data, error } = await supa.auth.signInAnonymously();
      if (error || !data.user) {
        setErrorMsg(
          error?.message ??
            "Couldn't start a guest session. Try signing in instead.",
        );
        setStatus("error");
        return;
      }
      writeCachedName(name);
      setUserId(data.user.id);
      setDisplayName(name);
      setStatus("ready");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  function onSubmitName(name: string) {
    void startAnonSession(name);
  }

  if (status === "resolving" || status === "signing-in") {
    return <Pending label={status === "signing-in" ? "Joining..." : "Loading..."} />;
  }

  if (status === "needs-name") {
    return <NameForm onSubmit={onSubmitName} />;
  }

  if (status === "error") {
    return <ErrorScreen detail={errorMsg} />;
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
    // localStorage disabled — fine, session-scoped name still works.
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

function ErrorScreen({ detail }: { detail: string | null }) {
  return (
    <main className="flex-1 flex items-center justify-center px-5 sm:px-10 pt-32 pb-16">
      <div className="w-full max-w-lg bg-surface border border-border rounded-lg p-8 sm:p-10 text-center">
        <div className="font-mono text-[11px] tracking-[3px] uppercase text-red mb-4">
          Couldn&rsquo;t start a guest session
        </div>
        <p className="text-muted mb-6">
          {detail ?? "Unknown error."} You can sign in with email instead to
          play.
        </p>
        <Link
          href="/signin?next=/party/online"
          className="inline-block bg-spotify text-background font-bold text-[15px] tracking-[0.5px] px-8 py-3.5 rounded-[4px] transition hover:-translate-y-px hover:bg-spotify-bright"
        >
          Sign in →
        </Link>
      </div>
    </main>
  );
}
