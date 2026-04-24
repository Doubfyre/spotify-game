"use client";

// Shared name-entry form that gates a leaderboard submission. Used on
// the Solo, Higher-or-Lower, and Daily result screens.
//
// Pre-fill priority:
//   1. "leaderboard-name" in localStorage (whatever they used last time).
//   2. Email local-part for signed-in users.
//   3. Empty.
//
// The parent owns the actual DB insert. We just surface the name they
// type and let them skip if they don't want to be on the board.

import { useEffect, useRef, useState } from "react";

export const LS_LEADERBOARD_NAME = "leaderboard-name";
export const MAX_NAME_LEN = 20;

export function prefillName(email: string | null | undefined): string {
  try {
    const cached = localStorage.getItem(LS_LEADERBOARD_NAME);
    if (cached && cached.trim().length > 0) {
      return cached.trim().slice(0, MAX_NAME_LEN);
    }
  } catch {
    // localStorage disabled — fall through
  }
  if (email) {
    const local = email.split("@")[0];
    if (local && local.length > 0) return local.slice(0, MAX_NAME_LEN);
  }
  return "";
}

export function cacheLeaderboardName(name: string) {
  try {
    localStorage.setItem(LS_LEADERBOARD_NAME, name);
  } catch {
    // localStorage disabled — fine
  }
}

export default function LeaderboardSubmitForm({
  initialName,
  metricLabel,
  onSubmit,
  onSkip,
}: {
  initialName: string;
  // "score" / "streak" — appears in the submit button and caption.
  metricLabel: string;
  onSubmit: (name: string) => Promise<void>;
  onSkip: () => void;
}) {
  const [value, setValue] = useState(initialName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const trimmed = value.trim().slice(0, MAX_NAME_LEN);
  const canSubmit = trimmed.length > 0 && !submitting;

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      cacheLeaderboardName(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-10 bg-surface border border-border rounded-lg p-6 sm:p-8">
      <div className="font-mono text-[11px] tracking-[3px] uppercase text-spotify mb-3 flex items-center gap-[10px]">
        <span className="w-6 h-px bg-spotify" />
        Submit to leaderboard
      </div>
      <p className="text-muted text-sm leading-[1.6] mb-5">
        Enter a name to post your {metricLabel} to the public leaderboard.
        Your personal best is saved either way.
      </p>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col sm:flex-row gap-3 sm:items-stretch"
      >
        <label htmlFor="lb-submit-name" className="sr-only">
          Display name
        </label>
        <input
          id="lb-submit-name"
          ref={inputRef}
          type="text"
          autoComplete="off"
          spellCheck={false}
          maxLength={MAX_NAME_LEN}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Your name"
          aria-label="Display name"
          className="focus-green flex-1 rounded-[4px] bg-background border border-border px-4 py-3 text-foreground placeholder:text-muted/60 transition"
        />
        <button
          type="submit"
          disabled={!canSubmit}
          className="bg-spotify text-background font-bold text-[14px] tracking-[0.5px] px-6 py-3 rounded-[4px] transition hover:-translate-y-px hover:bg-spotify-bright disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
        >
          {submitting ? "Submitting…" : "Submit score"}
        </button>
      </form>

      <div className="mt-3 flex items-center justify-between gap-4">
        <span className="font-mono text-[10px] tracking-[2px] uppercase text-muted">
          Max {MAX_NAME_LEN} characters
        </span>
        <button
          type="button"
          onClick={onSkip}
          disabled={submitting}
          className="font-mono text-[10px] tracking-[2px] uppercase text-muted hover:text-foreground transition disabled:opacity-50"
        >
          Skip
        </button>
      </div>

      {error && (
        <div className="mt-3 font-mono text-[11px] tracking-[1px] uppercase text-red">
          {error}
        </div>
      )}
    </section>
  );
}
