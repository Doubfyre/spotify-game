"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Section = {
  num: string;
  title: string;
  body: string;
};

const SECTIONS: Section[] = [
  {
    num: "01",
    title: "HOW SPOTIFY RANKING WORKS",
    body: "Spotify ranks every artist by monthly listeners. The top 500 most-listened-to artists appear on their profile pages. Position 501 and below don't show. The list updates daily and we take a fresh snapshot every night, resetting at midnight UK time.",
  },
  {
    num: "02",
    title: "SOLO PLAY",
    body: "You have 5 rounds. Each round, type the name of an artist you think is in today's Spotify top 500. Your score for that round is their rank number — so if they're ranked #487, you score 487 points. Aim as close to #500 as possible. Artists outside the top 500 score 0. Highest total score after 5 rounds wins.",
  },
  {
    num: "03",
    title: "DAILY CHALLENGE",
    body: "Three mystery artists are revealed one at a time. You don't know their rank — you have to guess it. Type a number between 1 and 500. Your score is the total distance from the correct answers across all three artists. If the answer is #312 and you guess #280, you score 32 for that artist. Lowest total score wins. One attempt per day — resets at midnight UK time.",
  },
  {
    num: "04",
    title: "PARTY MODE",
    body: "Play with up to 8 friends. Choose Pass & Play (one device, pass the phone between turns) or Online (each player on their own device using a room code). Once an artist is guessed in a party, it can't be used again in any round of that party. Highest cumulative score wins.",
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
        className="border border-border text-foreground rounded-[4px] px-2.5 sm:px-4 py-1.5 sm:py-2 text-[11px] sm:text-[13px] font-medium tracking-[0.3px] hover:border-spotify hover:text-spotify transition inline-flex items-center gap-2 shrink-0"
      >
        <span aria-hidden className="font-mono leading-none">
          ?
        </span>
        <span className="hidden sm:inline">How to Play</span>
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
            className="font-display tracking-[2px] leading-[0.95] text-foreground mb-10"
            style={{ fontSize: "clamp(40px, 8vw, 64px)" }}
          >
            THE SPOTIFY GAME
          </h2>

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
