"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase";

type Provider = "google" | "apple";

export default function SignInPage() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [loading, setLoading] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(
    typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("error") === "oauth_failed"
      ? "Sign-in didn't complete. Try again."
      : null,
  );

  async function signIn(provider: Provider) {
    setLoading(provider);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/`,
      },
    });
    // On success the browser navigates to the provider — no further code runs.
    if (error) {
      setError(error.message);
      setLoading(null);
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center px-5 sm:px-10 pt-32 pb-16">
      <div className="w-full max-w-md">
        <div className="bg-surface border border-border rounded-lg p-8 sm:p-10">
          <div className="font-mono text-[11px] tracking-[3px] uppercase text-spotify mb-5 flex items-center gap-[10px]">
            <span className="w-6 h-px bg-spotify" />
            Sign in
          </div>
          <h1
            className="font-display leading-none tracking-[2px] text-foreground mb-3"
            style={{ fontSize: "clamp(40px, 6vw, 56px)" }}
          >
            WELCOME
            <br />
            BACK
          </h1>
          <p className="text-muted mb-8 text-sm leading-relaxed">
            Sign in to save your daily scores and climb the leaderboard. No
            account needed to play — this is just for the scoreboard.
          </p>

          <div className="flex flex-col gap-3">
            <ProviderButton
              onClick={() => signIn("google")}
              disabled={loading !== null}
              loading={loading === "google"}
              label="Continue with Google"
              icon={<GoogleIcon />}
            />
            <ProviderButton
              onClick={() => signIn("apple")}
              disabled={loading !== null}
              loading={loading === "apple"}
              label="Continue with Apple"
              icon={<AppleIcon />}
            />
          </div>

          {error && (
            <div className="font-mono text-[11px] tracking-[1px] uppercase text-red mt-6">
              {error}
            </div>
          )}

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

function ProviderButton({
  onClick,
  disabled,
  loading,
  label,
  icon,
}: {
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-3 w-full bg-background border border-border text-foreground rounded-[4px] px-5 py-3.5 text-[15px] font-medium tracking-[0.3px] transition hover:border-foreground hover:-translate-y-px disabled:opacity-50 disabled:translate-y-0 disabled:cursor-not-allowed"
    >
      <span className="shrink-0 flex items-center" aria-hidden>
        {icon}
      </span>
      <span>{loading ? "Opening…" : label}</span>
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="#4285F4"
        d="M17.64 9.204c0-.638-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 384 512" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="currentColor"
        d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
      />
    </svg>
  );
}
