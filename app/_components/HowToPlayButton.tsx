"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Section = {
  num: string;
  title: string;
  body: string;
};

const INTRO =
  "Guessing the most popular artists in the world is easy. We all know everyone listens to Taylor Swift. The real challenge is finding the artists sitting right at the edge - popular enough to make the top 500, but only just. That's where the points are and that's our game.";

const SECTIONS: Section[] = [
  {
    num: "01",
    title: "HOW SPOTIFY RANKING WORKS",
    body: "Spotify tracks monthly listeners for every artist on the platform. The 500 most-listened-to artists each have their rank displayed on their profile. Drop to 501 and it disappears. We pull a fresh snapshot every night and reset at midnight UK time.",
  },
  {
    num: "02",
    title: "SOLO PLAY",
    body: "Five rounds. Each round, type an artist you think is in today's top 500. Your score is their rank - so rank #487 is worth 487 points. The closer to #500, the better. Miss the top 500 entirely and you score zero. Highest total after five rounds wins.",
  },
  {
    num: "03",
    title: "DAILY CHALLENGE",
    body: "Three artists, one at a time. You know their name - but not their rank. Guess where they sit in the top 500. Your score is how far off you are across all three guesses. If the answer is #312 and you guess #280, that's 32 points. Lower is better. One shot per day, resets at midnight.",
  },
  {
    num: "04",
    title: "PARTY MODE",
    body: "Two to eight players. Pass & Play uses one device - take turns and hand the phone over. Online gives everyone their own device via a room code. Once an artist is guessed, they're gone for the rest of the party. Highest cumulative score wins.",
  },
];

export default function HowToPlayButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="How to play"
        className="border border-border text-foreground rounded-[4px] px-2 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-[13px] font-medium tracking-[0.3px] hover:border-spotify hover:text-spotify transition inline-flex items-center gap-1.5 sm:gap-2 shrink-0 whitespace-nowrap"
      >
        <span aria-hidden className="font-mono leading-none">
          ?
        </span>
        <span>How to Play</span>
      </button>
      {open && <HowToPlayModal onClose={() => setOpen(false)} />}
    </>
  );
}

function HowToPlayModal({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  // Portal target isn't available until we're in the browser. Delay
  // rendering until after mount — critical because this component lives
  // under <nav>, which has `backdrop-filter: blur(2px)`. That CSS property
  // turns the nav into a containing block for any `position: fixed`
  // descendants, which would otherwise trap the modal inside the nav's
  // ~68px strip at the top of the page. Portaling to document.body
  // bypasses the trap entirely.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Escape closes
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Move focus inside the modal on open so Tab/Escape land naturally
  useEffect(() => {
    if (mounted) closeBtnRef.current?.focus();
  }, [mounted]);

  function onOverlayClick(e: React.MouseEvent) {
    if (!panelRef.current) return;
    if (!panelRef.current.contains(e.target as Node)) {
      onClose();
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="howto-full-title"
      onClick={onOverlayClick}
      className="fixed inset-0 z-[200] flex items-stretch sm:items-center justify-center sm:px-5 sm:py-10 animate-modal-fade-in"
      style={{
        background: "rgba(10, 10, 10, 0.85)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        ref={panelRef}
        className="relative w-full sm:max-w-[600px] bg-surface sm:border sm:border-border sm:rounded-lg max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto animate-modal-scale-in"
      >
        {/* Sticky close row — stays pinned to the top of the panel as the
           content scrolls underneath it. bg-surface/85 + backdrop blur keeps
           readability while letting content hint through. */}
        <div className="sticky top-0 z-10 flex justify-end px-3 sm:px-4 pt-3 pb-1 bg-surface/85 backdrop-blur-sm">
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 flex items-center justify-center rounded-[4px] text-muted hover:text-foreground hover:bg-border/40 transition text-3xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-6 sm:px-10 pb-10 pt-2">
          <div className="font-mono text-[11px] tracking-[3px] uppercase text-spotify mb-5 flex items-center gap-[10px]">
            <span className="w-6 h-px bg-spotify" />
            How to Play
          </div>
          <h2
            id="howto-full-title"
            className="font-display tracking-[2px] leading-[0.95] text-foreground mb-8"
            style={{ fontSize: "clamp(40px, 8vw, 64px)" }}
          >
            THE SPOTIFY GAME
          </h2>

          <p className="border-l-2 border-spotify/60 pl-5 text-[15px] sm:text-[17px] font-light leading-[1.65] text-foreground/90 mb-10">
            {INTRO}
          </p>

          <ol className="space-y-10">
            {SECTIONS.map((s) => (
              <li key={s.num} className="relative pl-14">
                <span
                  aria-hidden
                  className="absolute left-0 top-1 w-10 h-10 rounded-full border border-spotify flex items-center justify-center font-mono text-[11px] tracking-[2px] text-spotify"
                >
                  {s.num}
                </span>
                <h3
                  className="font-display tracking-[2px] text-spotify leading-[1] mb-3"
                  style={{ fontSize: "clamp(22px, 4vw, 30px)" }}
                >
                  {s.title}
                </h3>
                <p className="font-light text-foreground/90 leading-[1.7]">
                  {s.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>,
    document.body,
  );
}
