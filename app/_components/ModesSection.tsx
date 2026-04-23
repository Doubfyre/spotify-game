"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { msUntilLondonMidnight } from "@/lib/dates";

type ModalAction = { label: string; href: string };

type Mode = {
  id: "solo" | "daily" | "party";
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
  const [dailyScore, setDailyScore] = useState<number | null>(null);
  const openMode = openIdx !== null ? MODES[openIdx] : null;

  // After mount, check whether the player has completed today's daily. The
  // literal spec asks for a flat `daily-challenge-score` key; we also fall
  // back to parsing the existing date-scoped JSON blob that DailyChallenge
  // writes, so this works today without touching other files.
  useEffect(() => {
    let score: number | null = null;
    try {
      const flat = localStorage.getItem("daily-challenge-score");
      if (flat !== null && flat !== "") {
        const n = Number(flat);
        if (Number.isFinite(n) && n >= 0) score = n;
      }
      if (score === null) {
        const raw = localStorage.getItem(`daily-challenge:${todaySnapshot}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (
            parsed &&
            parsed.date === todaySnapshot &&
            typeof parsed.total === "number"
          ) {
            score = parsed.total;
          }
        }
      }
    } catch {
      // localStorage disabled or malformed — leave as null
    }
    if (score !== null) setDailyScore(score);
  }, [todaySnapshot]);

  return (
    <>
      <div className="h-full flex flex-col gap-4">
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 min-h-0">
          {MODES.map((mode, i) => (
            <ModeCard
              key={mode.id}
              mode={mode}
              tag={tagFor(mode, todayTag)}
              dailyScore={dailyScore}
              onOpen={() => setOpenIdx(i)}
            />
          ))}
        </div>
        <PlayerCountLine todaySnapshot={todaySnapshot} />
      </div>

      {openMode && (
        <HowToPlayModal mode={openMode} onClose={() => setOpenIdx(null)} />
      )}
    </>
  );
}

function tagFor(mode: Mode, todayTag: string): string {
  switch (mode.id) {
    case "solo":
      return "5 ROUNDS";
    case "daily":
      return `TODAY'S CHALLENGE · ${todayTag}`;
    case "party":
      return "2–8 PLAYERS";
  }
}

// ------------------------------------------------------------
// Card
// ------------------------------------------------------------

function ModeCard({
  mode,
  tag,
  dailyScore,
  onOpen,
}: {
  mode: Mode;
  tag: string;
  dailyScore: number | null;
  onOpen: () => void;
}) {
  const completed = mode.id === "daily" && dailyScore !== null;
  const cta = completed ? "Completed ✓" : "Play →";

  // The daily card gets an animated pulse ring (heartbeat) to hint at its
  // time-sensitive nature. Paused on hover via CSS (see globals.css).
  const pulseClass =
    mode.id === "daily" && !completed ? "animate-card-pulse" : "";

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open how-to-play for ${mode.name}`}
      className={`group relative bg-surface border border-border rounded-lg p-6 sm:p-7 text-left transition-colors duration-200 hover:border-spotify cursor-pointer overflow-hidden flex flex-col min-h-[320px] md:min-h-0 md:h-full ${pulseClass}`}
    >
      {/* Top: tag */}
      <div className="font-mono text-[11px] tracking-[2px] uppercase text-spotify">
        {tag}
      </div>

      {/* Upper-middle: title + description */}
      <div className="mt-4">
        <h3
          className="font-display tracking-[2px] text-foreground leading-none"
          style={{ fontSize: "clamp(28px, 3.4vw, 40px)" }}
        >
          {mode.name}
        </h3>
        <p className="mt-2 text-[13px] sm:text-[14px] text-muted leading-[1.5]">
          {mode.shortDesc}
        </p>
      </div>

      {/* Lower-middle: visual element — fills remaining space and scales on hover */}
      <div className="flex-1 flex items-center justify-center min-h-0 py-4">
        <div className="transition-transform duration-200 group-hover:scale-105">
          {mode.id === "solo" && <SoloVisual />}
          {mode.id === "daily" && (
            <DailyVisual score={dailyScore} completed={completed} />
          )}
          {mode.id === "party" && <PartyVisual />}
        </div>
      </div>

      {/* Bottom: Play button */}
      <div
        className={`font-mono text-[12px] tracking-[2px] uppercase ${completed ? "text-muted" : "text-spotify"}`}
      >
        {cta}
      </div>
    </button>
  );
}

// ------------------------------------------------------------
// Visual elements
// ------------------------------------------------------------

function SoloVisual() {
  // Reads the personal best from localStorage *after* mount — initial
  // render shows "—" so SSR and first client paint agree, then flips to
  // the stored score if present.
  const [best, setBest] = useState<number | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("solo-best-score");
      if (raw !== null) {
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 0) setBest(n);
      }
    } catch {
      // localStorage disabled — leave as null
    }
  }, []);

  return (
    <div className="text-center">
      <div className="font-mono text-[10px] tracking-[2px] uppercase text-muted mb-1">
        Your best score
      </div>
      <div
        className="font-display leading-none text-spotify tabular-nums"
        style={{ fontSize: "clamp(64px, 9vh, 104px)" }}
      >
        {best !== null ? best.toLocaleString() : "—"}
      </div>
    </div>
  );
}

function DailyVisual({
  score,
  completed,
}: {
  score: number | null;
  completed: boolean;
}) {
  if (completed && score !== null) {
    return (
      <div className="text-center">
        <div className="font-mono text-[10px] tracking-[2px] uppercase text-muted mb-1">
          Your score today
        </div>
        <div
          className="font-display leading-none text-spotify tabular-nums"
          style={{ fontSize: "clamp(64px, 9vh, 104px)" }}
        >
          {score}
        </div>
      </div>
    );
  }
  return <CountdownDisplay />;
}

function CountdownDisplay() {
  // Placeholder until the client tick lands — avoids SSR/client mismatch.
  const [display, setDisplay] = useState<string>("--:--:--");

  useEffect(() => {
    function tick() {
      const diff = msUntilLondonMidnight();
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      const pad = (n: number) => String(n).padStart(2, "0");
      setDisplay(`${pad(h)}:${pad(m)}:${pad(s)}`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="text-center">
      <div className="font-mono text-[10px] tracking-[2px] uppercase text-muted mb-2">
        Resets in
      </div>
      <div
        className="font-mono font-medium text-spotify tabular-nums tracking-[2px] leading-none"
        style={{ fontSize: "clamp(28px, 4.5vh, 44px)" }}
      >
        {display}
      </div>
    </div>
  );
}

function PartyVisual() {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-2">
        <span
          className="w-8 h-8 rounded-full border border-background"
          style={{ background: "var(--color-spotify)" }}
          aria-hidden
        />
        <span
          className="w-8 h-8 rounded-full border border-background"
          style={{ background: "var(--color-amber)" }}
          aria-hidden
        />
        <span
          className="w-8 h-8 rounded-full border border-background"
          style={{ background: "#3b82f6" }}
          aria-hidden
        />
        <span
          className="w-8 h-8 rounded-full border border-dashed border-muted flex items-center justify-center text-muted text-sm leading-none"
          aria-hidden
        >
          +
        </span>
      </div>
      <div className="mt-3 font-mono text-[10px] tracking-[2px] uppercase text-muted">
        Pass &amp; Play or Online
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Live player count (Supabase count query, refreshed every 60s)
// ------------------------------------------------------------

function PlayerCountLine({ todaySnapshot }: { todaySnapshot: string }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { count: n, error } = await supabase
        .from("daily_scores")
        .select("*", { count: "exact", head: true })
        .eq("snapshot_date", todaySnapshot);
      if (cancelled) return;
      if (error) {
        setCount(null);
        return;
      }
      setCount(n ?? 0);
    }
    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [todaySnapshot]);

  // Hide the whole line when we don't have something useful to say.
  if (count === null || count <= 0) return <div className="h-4" aria-hidden />;

  return (
    <div className="font-mono text-[10px] sm:text-[11px] tracking-[2px] uppercase text-muted text-center">
      {count.toLocaleString()} {count === 1 ? "person has" : "people have"}{" "}
      played today
    </div>
  );
}

// ------------------------------------------------------------
// Modal — unchanged from previous version
// ------------------------------------------------------------

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
