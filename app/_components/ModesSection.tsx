"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type ModalAction = { label: string; href: string };

type Mode = {
  num: string;
  icon: string;
  name: string;
  desc: string;
  tag: string;
  modal: {
    title: string;
    rules: string;
    actions: ModalAction[];
  };
};

const MODES: Mode[] = [
  {
    num: "01",
    icon: "🎯",
    name: "Solo Play",
    desc: "Five rounds. Pick artists you think are in the top 500. Your score is their rank — highest cumulative score across five rounds wins.",
    tag: "No account needed",
    modal: {
      title: "HOW TO PLAY — SOLO",
      rules:
        "5 rounds. Each round, type an artist you think is in Spotify's top 500. Your score is their rank number — so rank #487 scores 487 points. Highest total score after 5 rounds wins. Artists outside the top 500 score 0.",
      actions: [{ label: "Play Solo", href: "/solo" }],
    },
  },
  {
    num: "02",
    icon: "📅",
    name: "Daily Challenge",
    desc: "Three artists revealed each day. Guess their rank in the top 500. Lowest score wins — one attempt, everyone plays the same puzzle.",
    tag: "Live daily",
    modal: {
      title: "HOW TO PLAY — DAILY CHALLENGE",
      rules:
        "Three mystery artists are revealed one at a time. Guess each artist's exact rank in the top 500. Your score is the total distance from the correct answers — so if the answer is #312 and you guess #300, you score 12. Lowest total score wins. One attempt per day.",
      actions: [{ label: "Play Today's Challenge", href: "/daily" }],
    },
  },
  {
    num: "03",
    icon: "🎉",
    name: "Party Mode",
    desc: "Play with friends — pass one device around or create a live online room. Up to 8 players, take turns across five rounds.",
    tag: "2–8 players",
    modal: {
      title: "HOW TO PLAY — PARTY MODE",
      rules:
        "Play with friends in Pass & Play or Online mode. Each player guesses artists across 5 rounds. Once an artist is guessed in a party, they can't be guessed again. Highest cumulative score wins.",
      actions: [
        { label: "Pass & Play", href: "/party/passplay" },
        { label: "Play Online", href: "/party/online" },
      ],
    },
  },
];

export default function ModesSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const openMode = openIdx !== null ? MODES[openIdx] : null;

  return (
    <>
      <section
        id="modes"
        className="relative bg-off-black border-t border-b border-border py-24 px-5 sm:px-10"
      >
        <div className="mb-14">
          <div className="flex items-center gap-[10px] font-mono text-[11px] tracking-[3px] uppercase text-spotify font-medium mb-4">
            <span className="w-6 h-px bg-spotify" />
            Game Modes
          </div>
          <h2
            className="font-display tracking-[2px] leading-none"
            style={{ fontSize: "clamp(40px, 6vw, 72px)" }}
          >
            THREE WAYS
            <br />
            TO PLAY
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-[2px]">
          {MODES.map((mode, i) => (
            <ModeCard key={mode.num} mode={mode} onOpen={() => setOpenIdx(i)} />
          ))}
        </div>
      </section>

      {openMode && (
        <HowToPlayModal mode={openMode} onClose={() => setOpenIdx(null)} />
      )}
    </>
  );
}

function ModeCard({ mode, onOpen }: { mode: Mode; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open how-to-play for ${mode.name}`}
      className="block w-full text-left"
    >
      <article className="group relative bg-surface p-10 border border-transparent hover:border-spotify hover:-translate-y-0.5 cursor-pointer transition overflow-hidden h-full">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            background:
              "linear-gradient(135deg, rgba(31,223,100,0.05) 0%, transparent 60%)",
          }}
        />
        <div className="relative">
          <div className="font-display leading-none text-[72px] mb-4 text-white/[0.06] group-hover:text-spotify/15 transition-colors">
            {mode.num}
          </div>
          <span className="block text-[28px] mb-5" aria-hidden>
            {mode.icon}
          </span>
          <div className="font-display text-[32px] tracking-[2px] mb-3 text-foreground">
            {mode.name}
          </div>
          <p className="text-[14px] text-muted leading-[1.6] mb-7">
            {mode.desc}
          </p>
          <span className="inline-flex items-center gap-[6px] font-mono text-[10px] tracking-[2px] uppercase px-[10px] py-[5px] rounded-sm border border-border text-muted group-hover:border-spotify group-hover:text-spotify transition">
            <span className="w-[5px] h-[5px] rounded-full bg-current" />
            {mode.tag}
          </span>
        </div>
      </article>
    </button>
  );
}

function HowToPlayModal({
  mode,
  onClose,
}: {
  mode: Mode;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Escape key closes
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

  // Move focus into the modal on mount so keyboard users land inside it.
  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  function onOverlayClick(e: React.MouseEvent) {
    if (!panelRef.current) return;
    if (!panelRef.current.contains(e.target as Node)) {
      onClose();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="howto-title"
      onClick={onOverlayClick}
      className="fixed inset-0 z-[200] flex items-center justify-center px-5 py-10 animate-modal-fade-in"
      style={{
        background: "rgba(10, 10, 10, 0.8)",
        backdropFilter: "blur(6px)",
      }}
    >
      <div
        ref={panelRef}
        className="relative w-full max-w-lg bg-surface border border-border rounded-lg p-8 sm:p-10 animate-modal-scale-in"
      >
        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center rounded-[4px] text-muted hover:text-foreground hover:bg-border/40 transition text-2xl leading-none"
        >
          ×
        </button>

        <div className="font-mono text-[11px] tracking-[3px] uppercase text-spotify mb-5 flex items-center gap-[10px]">
          <span className="w-6 h-px bg-spotify" />
          Instructions
        </div>

        <h2
          id="howto-title"
          className="font-display tracking-[2px] leading-[0.95] text-spotify mb-6"
          style={{ fontSize: "clamp(32px, 6vw, 48px)" }}
        >
          {mode.modal.title}
        </h2>

        <p className="text-foreground font-light leading-[1.7] mb-8">
          {mode.modal.rules}
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          {mode.modal.actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex-1 bg-spotify text-background font-bold text-[15px] tracking-[0.5px] px-8 py-3.5 rounded-[4px] text-center transition hover:-translate-y-px hover:bg-spotify-bright"
            >
              {action.label} →
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
