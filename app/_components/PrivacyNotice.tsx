"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY = "privacy-notice-dismissed";

/**
 * Small fixed banner informing visitors we store game state in localStorage.
 * Appears once for anonymous first-time visitors, persists dismissal in
 * localStorage. `show` is controlled by the server layout — logged-in users
 * never see it (they accepted terms implicitly on signup).
 */
export default function PrivacyNotice({ show }: { show: boolean }) {
  // Start dismissed so SSR renders nothing and there's no client-mismatch
  // flash. The real value is loaded from localStorage after mount.
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!show) return;
    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) !== null);
    } catch {
      // localStorage disabled — don't nag, treat as dismissed
      setDismissed(true);
    }
  }, [show]);

  if (!show || dismissed) return null;

  function handleDismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    setDismissed(true);
  }

  return (
    <div
      role="region"
      aria-label="Privacy notice"
      // z-[150] sits above the noise overlay (z-100) and nav (z-50) but
      // below modals (z-[200]) so a how-to-play overlay covers it cleanly.
      className="fixed inset-x-0 bottom-0 z-[150] px-3 sm:px-6 pb-3 sm:pb-6 pointer-events-none"
    >
      <div
        className="pointer-events-auto mx-auto max-w-2xl bg-surface border border-border rounded-lg p-4 sm:p-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 shadow-lg"
        style={{ backdropFilter: "blur(4px)" }}
      >
        <p className="text-[13px] sm:text-[14px] leading-[1.5] text-foreground flex-1">
          We use localStorage to save your game progress. No tracking cookies.{" "}
          <Link href="/privacy" className="text-spotify hover:underline">
            Learn more
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={handleDismiss}
          className="bg-spotify text-background font-bold text-[13px] tracking-[0.3px] px-5 py-2 rounded-[4px] hover:bg-spotify-bright transition shrink-0"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
