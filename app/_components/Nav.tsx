"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase";

export type NavUser = {
  displayName: string;
  avatarUrl: string | null;
} | null;

export default function Nav({ user }: { user: NavUser }) {
  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-5 sm:px-10 py-5"
      style={{
        background:
          "linear-gradient(to bottom, rgba(10,10,10,0.95) 0%, transparent 100%)",
        backdropFilter: "blur(2px)",
      }}
    >
      <Link
        href="/"
        className="font-display text-[22px] sm:text-[28px] tracking-[0.2em] flex items-center gap-2 text-foreground"
      >
        <span className="inline-block w-2 h-2 rounded-full bg-spotify animate-pulse-dot" />
        THE SPOTIFY GAME
      </Link>
      <div className="flex items-center gap-3 sm:gap-4">
        {user ? <UserMenu user={user} /> : <AuthButtons />}
      </div>
    </nav>
  );
}

function AuthButtons() {
  return (
    <>
      <Link
        href="/signin"
        className="border border-border text-foreground rounded-[4px] px-4 sm:px-5 py-2 text-[13px] font-medium tracking-[0.3px] hover:border-spotify hover:text-spotify transition"
      >
        Log In
      </Link>
      <Link
        href="/signin"
        className="bg-spotify border border-spotify text-background rounded-[4px] px-4 sm:px-5 py-2 text-[13px] font-medium tracking-[0.3px] hover:bg-spotify-bright hover:border-spotify-bright transition"
      >
        Sign Up Free
      </Link>
    </>
  );
}

function UserMenu({ user }: { user: NonNullable<NavUser> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function signOut() {
    setSigningOut(true);
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    setOpen(false);
    // router.refresh() re-runs the server component tree, which reads cookies
    // again and renders the logged-out nav.
    router.refresh();
    setSigningOut(false);
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex items-center gap-2 border border-border text-foreground rounded-[4px] px-3 py-1.5 text-[13px] font-medium tracking-[0.3px] hover:border-foreground transition"
      >
        {user.avatarUrl ? (
          // Using a plain <img> rather than next/image — OAuth avatars are
          // on arbitrary hosts and configuring remotePatterns per-provider
          // is more effort than it's worth for a 28px thumbnail.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="w-6 h-6 rounded-full object-cover"
          />
        ) : (
          <span className="w-6 h-6 rounded-full bg-spotify text-background flex items-center justify-center text-[11px] font-bold">
            {user.displayName.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="hidden sm:inline">{user.displayName}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden
          className={`transition ${open ? "rotate-180" : ""}`}
        >
          <path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-48 bg-surface border border-border rounded-[4px] overflow-hidden shadow-lg"
        >
          <div className="px-4 py-3 border-b border-border">
            <div className="font-mono text-[10px] tracking-[2px] uppercase text-muted">
              Signed in as
            </div>
            <div className="text-foreground truncate">{user.displayName}</div>
          </div>
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="w-full text-left px-4 py-3 text-sm text-foreground hover:bg-surface-raised transition disabled:opacity-50"
            role="menuitem"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
