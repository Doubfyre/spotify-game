"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase, createBrowserSupabase } from "@/lib/supabase";
import { getTodayLondon, msUntilLondonMidnight } from "@/lib/dates";
import HomeCardLeaderboard, {
  type HomeLeaderboardVariant,
} from "./HomeCardLeaderboard";

type ModalAction = { label: string; href: string };

type Mode = {
  id: "solo" | "daily" | "party" | "higherlower";
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
  {
    id: "higherlower",
    name: "Higher or Lower",
    shortDesc: "Two artists. Pick who has more monthly listeners.",
    modal: {
      title: "HOW TO PLAY — HIGHER OR LOWER",
      rules:
        "Two artists are shown side by side. Tap the one you think has more monthly listeners on Spotify. Correct answer = streak goes up, next pair. Wrong = game over. No time limit. How long can your streak run?",
      actions: [{ label: "Play Higher or Lower", href: "/higherorlower" }],
    },
  },
];

export default function ModesSection({
  todaySnapshot,
  todayTag,
  serverDailyCompleted = false,
}: {
  todaySnapshot: string;
  todayTag: string;
  serverDailyCompleted?: boolean;
}) {
  const router = useRouter();
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [dailyScore, setDailyScore] = useState<number | null>(null);
  const openMode = openIdx !== null ? MODES[openIdx] : null;

  // Truthy whenever the server confirmed a daily submission for this user
  // OR localStorage has a score from playing on this device. Either signal
  // is enough to flip the card to "Completed ✓".
  const dailyCompleted = serverDailyCompleted || dailyScore !== null;

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
      <div className="flex-1 flex flex-col gap-2 sm:gap-4 min-h-0">
        <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 min-h-0">
          {MODES.map((mode, i) => (
            <ModeCard
              key={mode.id}
              mode={mode}
              tag={tagFor(mode, todayTag)}
              dailyScore={dailyScore}
              dailyCompleted={dailyCompleted}
              onOpen={() => {
                // If the player already finished today's daily, skip the
                // "how to play" modal and take them straight to /daily
                // where their results + share button live.
                if (mode.id === "daily" && dailyCompleted) {
                  router.push("/daily");
                  return;
                }
                setOpenIdx(i);
              }}
            />
          ))}
        </div>
        <PlayerCountLine />
        <div className="text-center">
          <Link
            href="/privacy"
            className="font-mono text-[10px] tracking-[2px] uppercase text-muted/70 hover:text-muted transition"
          >
            Privacy
          </Link>
        </div>
      </div>

      {openMode && (
        <HowToPlayModal mode={openMode} onClose={() => setOpenIdx(null)} />
      )}
    </>
  );
}

function tagFor(mode: Mode, todayTag: string): React.ReactNode {
  switch (mode.id) {
    case "solo":
      return "5 ROUNDS";
    case "daily":
      // Mobile cards are too narrow for the full "TODAY'S CHALLENGE"
      // label + date — it wraps to two lines and pushes the card taller.
      // Show a short form on mobile, the long form from sm: up.
      return (
        <>
          <span className="sm:hidden">DAILY · {todayTag}</span>
          <span className="hidden sm:inline">
            TODAY&rsquo;S CHALLENGE · {todayTag}
          </span>
        </>
      );
    case "party":
      return "2–8 PLAYERS";
    case "higherlower":
      return "UNLIMITED PLAYS";
  }
}

// ------------------------------------------------------------
// Card
// ------------------------------------------------------------

function ModeCard({
  mode,
  tag,
  dailyScore,
  dailyCompleted,
  onOpen,
}: {
  mode: Mode;
  tag: React.ReactNode;
  dailyScore: number | null;
  dailyCompleted: boolean;
  onOpen: () => void;
}) {
  const completed = mode.id === "daily" && dailyCompleted;
  const cta = completed ? "Completed ✓" : "Play →";

  // Collapsible mini-leaderboard. Party mode has no scores table, so it
  // opts out of the toggle entirely.
  const leaderboardVariant: HomeLeaderboardVariant | null =
    mode.id === "solo"
      ? "solo"
      : mode.id === "daily"
        ? "daily"
        : mode.id === "higherlower"
          ? "higherlower"
          : null;
  const [lbOpen, setLbOpen] = useState(false);

  // The daily card gets an animated pulse ring (heartbeat) to hint at its
  // time-sensitive nature. Paused on hover via CSS (see globals.css).
  const pulseClass =
    mode.id === "daily" && !completed ? "animate-card-pulse" : "";

  return (
    <div
      className={`group relative bg-surface border border-border rounded-lg transition-colors duration-200 hover:border-spotify overflow-hidden flex flex-col min-h-0 md:h-full ${pulseClass}`}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open how-to-play for ${mode.name}`}
        className="flex-1 flex flex-col p-3 sm:p-7 text-left cursor-pointer min-h-0"
      >
        {/* Top: tag */}
        <div className="font-mono text-[9px] sm:text-[11px] tracking-[1.5px] sm:tracking-[2px] uppercase text-spotify leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
          {tag}
        </div>

        {/* Upper-middle: title + description (description hidden on mobile
            to keep the card compact — title + tag carry the meaning) */}
        <div className="mt-2 sm:mt-4">
          <h3
            className="font-display tracking-[1.5px] sm:tracking-[2px] text-foreground leading-none"
            style={{ fontSize: "clamp(18px, 3.4vw, 40px)" }}
          >
            {mode.name}
          </h3>
          <p className="hidden sm:block mt-2 text-[13px] sm:text-[14px] text-muted leading-[1.5]">
            {mode.shortDesc}
          </p>
        </div>

        {/* Lower-middle: visual element — fills remaining space and scales on hover */}
        <div className="flex-1 flex items-center justify-center min-h-0 py-1 sm:py-4">
          <div className="transition-transform duration-200 group-hover:scale-105">
            {mode.id === "solo" && <SoloVisual />}
            {mode.id === "daily" && (
              <DailyVisual score={dailyScore} completed={completed} />
            )}
            {mode.id === "party" && <PartyVisual />}
            {mode.id === "higherlower" && <HigherLowerVisual />}
          </div>
        </div>

        {/* Bottom: Play button */}
        <div
          className={`font-mono text-[10px] sm:text-[12px] tracking-[1.5px] sm:tracking-[2px] uppercase ${completed ? "text-muted" : "text-spotify"}`}
        >
          {cta}
        </div>
      </button>

      {leaderboardVariant && (
        <div className="border-t border-border/60 px-3 sm:px-7 py-2 sm:py-3">
          <button
            type="button"
            onClick={() => setLbOpen((v) => !v)}
            aria-expanded={lbOpen}
            aria-label={`${lbOpen ? "Hide" : "Show"} ${mode.name} leaderboard`}
            className="font-mono text-[9px] sm:text-[10px] tracking-[1.5px] sm:tracking-[2px] uppercase text-muted hover:text-foreground transition"
          >
            Leaderboard {lbOpen ? "−" : "+"}
          </button>
          <HomeCardLeaderboard variant={leaderboardVariant} isOpen={lbOpen} />
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Visual elements
// ------------------------------------------------------------

function SoloVisual() {
  // Source of truth: profiles.solo_best_score for signed-in users
  // (cross-device), localStorage for anonymous visitors. Initial state is
  // null so SSR shows "—" and hydration stays stable; the effect below
  // fills it in on the client.
  const [best, setBest] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supa = createBrowserSupabase();
      const {
        data: { user },
      } = await supa.auth.getUser();
      if (user) {
        const { data } = await supa
          .from("profiles")
          .select("solo_best_score")
          .eq("id", user.id)
          .maybeSingle();
        if (cancelled) return;
        const serverBest =
          data && typeof (data as { solo_best_score: number | null }).solo_best_score === "number"
            ? (data as { solo_best_score: number }).solo_best_score
            : null;
        if (serverBest !== null) {
          setBest(serverBest);
          return;
        }
        // Signed-in but no server record yet — fall through to localStorage
        // as a last resort so their first few local games aren't blank.
      }
      try {
        const raw = localStorage.getItem("solo-best-score");
        if (raw !== null) {
          const n = Number(raw);
          if (Number.isFinite(n) && n >= 0 && !cancelled) setBest(n);
        }
      } catch {
        // localStorage disabled — leave as null
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="text-center">
      <div className="font-mono text-[9px] sm:text-[10px] tracking-[1.5px] sm:tracking-[2px] uppercase text-muted mb-0.5 sm:mb-1">
        Your best score
      </div>
      <div
        className="font-display leading-none text-spotify tabular-nums"
        style={{ fontSize: "clamp(28px, 5vh, 96px)" }}
      >
        {best !== null ? best.toLocaleString() : "—"}
      </div>
    </div>
  );
}

function HigherLowerVisual() {
  // Same server/localStorage hybrid as SoloVisual: signed-in users see
  // their profiles.higher_lower_best_streak; anon visitors fall back to
  // localStorage. Initial null keeps SSR/hydration stable.
  const [best, setBest] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supa = createBrowserSupabase();
      const {
        data: { user },
      } = await supa.auth.getUser();
      if (user) {
        const { data } = await supa
          .from("profiles")
          .select("higher_lower_best_streak")
          .eq("id", user.id)
          .maybeSingle();
        if (cancelled) return;
        const serverBest =
          data &&
          typeof (data as { higher_lower_best_streak: number | null })
            .higher_lower_best_streak === "number"
            ? (data as { higher_lower_best_streak: number })
                .higher_lower_best_streak
            : null;
        if (serverBest !== null) {
          setBest(serverBest);
          return;
        }
      }
      try {
        const raw = localStorage.getItem("higher-lower-best-streak");
        if (raw !== null) {
          const n = Number(raw);
          if (Number.isFinite(n) && n >= 0 && !cancelled) setBest(n);
        }
      } catch {
        // localStorage disabled — leave as null
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="text-center">
      <div className="font-mono text-[9px] sm:text-[10px] tracking-[1.5px] sm:tracking-[2px] uppercase text-muted mb-0.5 sm:mb-1">
        Best streak
      </div>
      <div
        className="font-display leading-none text-spotify tabular-nums"
        style={{ fontSize: "clamp(28px, 5vh, 96px)" }}
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
        <div className="font-mono text-[9px] sm:text-[10px] tracking-[1.5px] sm:tracking-[2px] uppercase text-muted mb-0.5 sm:mb-1">
          Your score today
        </div>
        <div
          className="font-display leading-none text-spotify tabular-nums"
          style={{ fontSize: "clamp(28px, 5vh, 96px)" }}
        >
          {score}
        </div>
      </div>
    );
  }
  if (completed) {
    // Server confirmed completion (cross-device), but we don't know the
    // score from this device's localStorage — render a completed indicator
    // instead of the countdown or a score.
    return (
      <div className="text-center">
        <div className="font-mono text-[9px] sm:text-[10px] tracking-[1.5px] sm:tracking-[2px] uppercase text-muted mb-0.5 sm:mb-1">
          Completed
        </div>
        <div
          className="font-display leading-none text-spotify"
          style={{ fontSize: "clamp(28px, 5vh, 96px)" }}
        >
          ✓
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
      <div className="font-mono text-[9px] sm:text-[10px] tracking-[1.5px] sm:tracking-[2px] uppercase text-muted mb-1 sm:mb-2">
        Resets in
      </div>
      <div
        className="font-mono font-medium text-spotify tabular-nums tracking-[1.5px] sm:tracking-[2px] leading-none"
        style={{ fontSize: "clamp(14px, 2.8vh, 40px)" }}
      >
        {display}
      </div>
    </div>
  );
}

function PartyVisual() {
  return (
    <div className="text-center">
      <div className="font-mono text-[10px] sm:text-[12px] tracking-[1.5px] sm:tracking-[2px] uppercase text-muted leading-tight whitespace-nowrap">
        Up to 8 players
      </div>
      <div className="mt-1 sm:mt-3 font-mono text-[9px] sm:text-[10px] tracking-[1.5px] sm:tracking-[2px] uppercase text-muted">
        Pass &amp; Play or Online
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Live player count (Supabase count query, refreshed every 60s)
// ------------------------------------------------------------

function PlayerCountLine() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Recompute "today" in London on every poll so the counter rolls over
      // at midnight UK even when a tab has been left open past midnight.
      const todayLondon = getTodayLondon();

      // PostgREST doesn't expose COUNT(DISTINCT …), so we fetch the two
      // identity columns for today's rows and dedupe client-side. Daily
      // submission volume is small (thousands of rows at most) so the extra
      // bytes beat an RPC + migration.
      const { data, error } = await supabase
        .from("daily_scores")
        .select("user_id, player_name")
        .eq("snapshot_date", todayLondon);
      if (cancelled) return;
      if (error) {
        setCount(null);
        return;
      }
      const unique = new Set<string>();
      for (const row of (data ?? []) as Array<{
        user_id: string | null;
        player_name: string | null;
      }>) {
        // Prefer user_id (stable across name changes); fall back to
        // player_name for anonymous submissions.
        const key = row.user_id ?? row.player_name;
        if (key) unique.add(String(key));
      }
      setCount(unique.size);
    }
    load();
    const id = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

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
