"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type ModalAction = { label: string; href: string };

type Mode = {
  id: "solo" | "daily" | "party";
  num: string;
  name: string;
  shortDesc: string;
  modal: {
    title: string;
    rules: string;
    actions: ModalAction[];
  };
};

const MODES: Mode[] = [
  {
    id: "solo",
    num: "01",
    name: "Solo Play",
    shortDesc: "Five rounds. Guess high-ranking artists for points.",
    modal: {
      title: "HOW TO PLAY — SOLO",
      rules:
        "5 rounds. Each round, type an artist you think is in Spotify's top 500. Your score is their rank number — so rank #487 scores 487 points. Highest total score after 5 rounds wins. Artists outside the top 500 score 0.",
      actions: [{ label: "Play Solo", href: "/solo" }],
    },
  },
  {
    id: "daily",
    num: "02",
    name: "Daily Challenge",
    shortDesc: "Three mystery artists. Guess their exact ranks.",
    modal: {
      title: "HOW TO PLAY — DAILY CHALLENGE",
      rules:
        "Three mystery artists are revealed one at a time. Guess each artist's exact rank in the top 500. Your score is the total distance from the correct answers — so if the answer is #312 and you guess #300, you score 12. Lowest total score wins. One attempt per day.",
      actions: [{ label: "Play Today's Challenge", href: "/daily" }],
    },
  },
  {
    id: "party",
    num: "03",
    name: "Party Mode",
    shortDesc: "Play with friends. Same device or online room.",
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

export default function ModesSection({
  todaySnapshot,
  todayTag,
}: {
  todaySnapshot: string;
  todayTag: string;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [dailyCompleted, setDailyCompleted] = useState(false);
  const openMode = openIdx !== null ? MODES[openIdx] : null;

  // Check localStorage *after mount* so the SSR markup matches the first
  // client paint. If the user has completed today's daily, flip the card's
  // CTA to "Completed ✓".
  useEffect(() => {
    try {
      if (localStorage.getItem(`daily-challenge:${todaySnapshot}`)) {
        setDailyCompleted(true);
      }
    } catch {
      // localStorage can be disabled (private mode, iframes) — ignore.
    }
  }, [todaySnapshot]);

  return (
    <>
      <div className="h-full grid grid-cols-1 md:grid-cols-3 gap-4">
        {MODES.map((mode, i) => (
          <ModeCard
            key={mode.id}
            mode={mode}
            tag={tagFor(mode, { todayTag })}
            cta={mode.id === "daily" && dailyCompleted ? "Completed ✓" : "Play →"}
            completed={mode.id === "daily" && dailyCompleted}
            onOpen={() => setOpenIdx(i)}
          />
        ))}
      </div>

      {openMode && (
        <HowToPlayModal mode={openMode} onClose={() => setOpenIdx(null)} />
      )}
    </>
  );
}

function tagFor(mode: Mode, ctx: { todayTag: string }): string {
  switch (mode.id) {
    case "solo":
      return "5 ROUNDS";
    case "daily":
      return `TODAY'S CHALLENGE · ${ctx.todayTag}`;
    case "party":
      return "2–8 PLAYERS";
  }
}

function ModeCard({
  mode,
  tag,
  cta,
  completed,
  onOpen,
}: {
  mode: Mode;
  tag: string;
  cta: string;
  completed: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open how-to-play for ${mode.name}`}
      className="group relative bg-surface border border-border rounded-lg p-6 sm:p-8 text-left transition hover:border-spotify hover:-translate-y-0.5 cursor-pointer overflow-hidden flex flex-col min-h-[220px] md:min-h-0 md:h-full"
    >
      {/* hover gradient wash */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{
          background:
            "linear-gradient(135deg, rgba(31,223,100,0.05) 0%, transparent 60%)",
        }}
      />

      {/* large faded number in the background */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-2 right-4 font-display leading-none text-white/[0.06] group-hover:text-spotify/15 transition-colors select-none"
        style={{ fontSize: "clamp(96px, 14vh, 180px)" }}
      >
        {mode.num}
      </span>

      <div className="relative flex flex-col h-full">
        <div className="font-mono text-[11px] tracking-[2px] uppercase text-spotify mb-3">
          {tag}
        </div>
        <h3
          className="font-display tracking-[2px] text-foreground mb-3 leading-none"
          style={{ fontSize: "clamp(28px, 3.5vw, 42px)" }}
        >
          {mode.name}
        </h3>
        <p className="text-[14px] text-muted leading-[1.5] flex-1">
          {mode.shortDesc}
        </p>
        <div
          className={`mt-6 font-mono text-[12px] tracking-[2px] uppercase ${
            completed ? "text-muted" : "text-spotify"
          } group-hover:gap-3 transition-all`}
        >
          {cta}
        </div>
      </div>
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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
