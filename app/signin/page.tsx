"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState, type FormEvent } from "react";
import { createBrowserSupabase } from "@/lib/supabase";

type Mode = "signin" | "signup";

const MIN_PASSWORD_LENGTH = 6;

// Supabase surfaces raw auth errors that aren't always user-friendly. Map
// the common ones into plain-English messages and pass everything else
// through verbatim.
function friendlyError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("invalid login credentials"))
    return "Email or password is incorrect.";
  if (lower.includes("email not confirmed"))
    return "Please confirm your email address before signing in.";
  if (
    lower.includes("user already registered") ||
    lower.includes("already been registered")
  )
    return "An account with this email already exists. Try signing in instead.";
  if (lower.includes("rate limit"))
    return "Too many attempts. Please wait a moment and try again.";
  if (lower.includes("password should be at least"))
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  return msg;
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInInner />
    </Suspense>
  );
}

// useSearchParams forces this component into the client; wrapping in Suspense
// above avoids build-time warnings about static prerender boundaries.
function SignInInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Only allow same-origin relative paths as next= targets, to avoid open
  // redirects like ?next=https://evil.com.
  const rawNext = searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setInfo(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError("Email and password are required.");
      return;
    }
    if (!cleanEmail.includes("@")) {
      setError("That doesn't look like a valid email address.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setLoading(true);

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      setLoading(false);
      if (error) {
        setError(friendlyError(error.message));
        return;
      }
      // Cookies are set by the browser client — nudge the server to re-read
      // them so the nav updates immediately.
      router.push(next);
      router.refresh();
      return;
    }

    // Sign up
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setLoading(false);
    if (error) {
      setError(friendlyError(error.message));
      return;
    }
    if (data.session) {
      // Supabase project has email confirmation disabled — already signed in.
      router.push(next);
      router.refresh();
      return;
    }
    // Email confirmation is required. Prompt the user to check their inbox
    // and drop them back on the sign-in form.
    setInfo(
      "Account created. Check your email for a confirmation link, then sign in.",
    );
    setMode("signin");
    setPassword("");
  }

  const submitting = loading;

  return (
    <main className="flex-1 flex items-center justify-center px-5 sm:px-10 pt-32 pb-16">
      <div className="w-full max-w-md">
        <div className="bg-surface border border-border rounded-lg p-8 sm:p-10">
          {/* Logo inside the card */}
          <div className="flex items-center gap-2 mb-8">
            <span className="inline-block w-2 h-2 rounded-full bg-spotify animate-pulse-dot" />
            <span className="font-display text-[22px] tracking-[0.2em] text-foreground">
              THE SPOTIFY GAME
            </span>
          </div>

          <div className="font-mono text-[11px] tracking-[3px] uppercase text-spotify mb-5 flex items-center gap-[10px]">
            <span className="w-6 h-px bg-spotify" />
            {mode === "signin" ? "Sign in" : "Create account"}
          </div>
          <h1
            className="font-display leading-none tracking-[2px] text-foreground mb-3"
            style={{ fontSize: "clamp(40px, 6vw, 56px)" }}
          >
            {mode === "signin" ? (
              <>
                WELCOME
                <br />
                BACK
              </>
            ) : (
              <>
                JOIN
                <br />
                THE GAME
              </>
            )}
          </h1>
          <p className="text-muted mb-8 text-sm leading-relaxed">
            Sign in to save your daily scores and climb the leaderboard. No
            account needed to play — this is just for the scoreboard.
          </p>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className="font-mono text-[10px] tracking-[2px] uppercase text-muted">
                Email
              </span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="focus-green w-full rounded-[4px] bg-background border border-border px-4 py-3 text-foreground placeholder:text-muted/60 transition"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="font-mono text-[10px] tracking-[2px] uppercase text-muted">
                Password
              </span>
              <input
                type="password"
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
                required
                minLength={MIN_PASSWORD_LENGTH}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                className="focus-green w-full rounded-[4px] bg-background border border-border px-4 py-3 text-foreground placeholder:text-muted/60 transition"
              />
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 bg-spotify text-background font-bold text-[15px] tracking-[0.5px] px-8 py-3.5 rounded-[4px] transition hover:-translate-y-px hover:bg-spotify-bright disabled:opacity-50 disabled:translate-y-0 disabled:cursor-not-allowed"
            >
              {submitting
                ? mode === "signin"
                  ? "Signing in…"
                  : "Creating account…"
                : mode === "signin"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>

          {error && (
            <div className="font-mono text-[11px] tracking-[1px] uppercase text-red mt-5">
              {error}
            </div>
          )}
          {info && !error && (
            <div className="font-mono text-[11px] tracking-[1px] uppercase text-spotify mt-5">
              {info}
            </div>
          )}

          <div className="mt-6 text-sm text-muted">
            {mode === "signin" ? (
              <>
                New here?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("signup")}
                  className="text-spotify hover:underline"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("signin")}
                  className="text-spotify hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </div>

          <div className="mt-8 pt-6 border-t border-border text-center">
            <Link
              href="/"
              className="font-mono text-[11px] tracking-[2px] uppercase text-muted hover:text-foreground transition"
            >
              ← Back to home
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
