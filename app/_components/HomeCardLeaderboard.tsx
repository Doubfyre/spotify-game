"use client";

// Per-mode leaderboard modal triggered from the homepage cards. Three
// variants:
//   - solo:        solo_scores,         score  desc
//   - daily:       daily_scores,        score  asc  (lower wins)
//   - higherlower: higher_lower_scores, streak desc
//
// Lazy-fetches on first open so the homepage render doesn't pay for
// tables the user never looks at. Portaled to document.body (same
// pattern as HowToPlayButton) so no ancestor's backdrop-filter /
// transform traps the fixed overlay inside a nested container.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { getTodayLondon, londonDayStartUTC } from "@/lib/dates";

export type HomeLeaderboardVariant = "solo" | "daily" | "higherlower";

type Row = { player_name: string; metric: number };

const TOP_LIMIT = 5;
// Over-fetch so there's enough to dedupe by player_name and still show
// a full top 5. Logged-in rows are already unique per user via the DB
// partial index; this covers anonymous submissions.
const OVER_FETCH = 25;

async function fetchForVariant(
  variant: HomeLeaderboardVariant,
): Promise<{ all: Row[]; today: Row[] }> {
  const snapshot = getTodayLondon();
  const todayStartISO = londonDayStartUTC(snapshot);

  if (variant === "solo") {
    const base = () =>
      supabase
        .from("solo_scores")
        .select("player_name, score")
        .order("score", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(OVER_FETCH);
    const [a, t] = await Promise.all([
      base(),
      base().gte("created_at", todayStartISO),
    ]);
    throwIfError(a.error, t.error);
    return {
      all: collapse(normalise(a.data as unknown[], "score"), "desc"),
      today: collapse(normalise(t.data as unknown[], "score"), "desc"),
    };
  }
  if (variant === "higherlower") {
    const base = () =>
      supabase
        .from("higher_lower_scores")
        .select("player_name, streak")
        .order("streak", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(OVER_FETCH);
    const [a, t] = await Promise.all([
      base(),
      base().gte("created_at", todayStartISO),
    ]);
    throwIfError(a.error, t.error);
    return {
      all: collapse(normalise(a.data as unknown[], "streak"), "desc"),
      today: collapse(normalise(t.data as unknown[], "streak"), "desc"),
    };
  }
  // daily
  const base = () =>
    supabase
      .from("daily_scores")
      .select("player_name, score")
      .order("score", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(OVER_FETCH);
  const [a, t] = await Promise.all([
    base(),
    base().eq("snapshot_date", snapshot),
  ]);
  throwIfError(a.error, t.error);
  return {
    all: collapse(normalise(a.data as unknown[], "score"), "asc"),
    today: collapse(normalise(t.data as unknown[], "score"), "asc"),
  };
}

function normalise(rows: unknown[], col: "score" | "streak"): Row[] {
  return (rows as Array<Record<string, unknown>>).map((r) => ({
    player_name: String(r.player_name ?? ""),
    metric: Number(r[col] ?? 0),
  }));
}

function collapse(rows: Row[], direction: "asc" | "desc"): Row[] {
  const best = new Map<string, Row>();
  for (const r of rows) {
    const key = r.player_name.toLowerCase();
    const prev = best.get(key);
    if (!prev) {
      best.set(key, r);
      continue;
    }
    const prevIsBetter =
      direction === "desc" ? prev.metric >= r.metric : prev.metric <= r.metric;
    if (!prevIsBetter) best.set(key, r);
  }
  return Array.from(best.values()).slice(0, TOP_LIMIT);
}

function throwIfError(
  ...errs: Array<{ message: string } | null | undefined>
): void {
  for (const e of errs) {
    if (e) throw new Error(e.message);
  }
}

export default function HomeCardLeaderboard({
  open,
  onClose,
  variant,
  modeName,
}: {
  open: boolean;
  onClose: () => void;
  variant: HomeLeaderboardVariant;
  // Used for the title — "{MODE NAME} LEADERBOARD".
  modeName: string;
}) {
  const [allRows, setAllRows] = useState<Row[] | null>(null);
  const [todayRows, setTodayRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Portal target isn't available until after mount on the client.
  // Delay rendering until then — same guard as HowToPlayButton, which
  // also mitigates fixed-positioning traps inside containers with
  // backdrop-filter / transform.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Lazy fetch on first open. We cache across subsequent opens — tables
  // move slowly enough that a single fetch per page visit is plenty.
  useEffect(() => {
    if (!open || loaded) return;
    setLoaded(true);
    (async () => {
      try {
        const { all, today } = await fetchForVariant(variant);
        setAllRows(all);
        setTodayRows(today);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [open, loaded, variant]);

  // Escape closes. Only bind while open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Body scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Focus the close button when the modal becomes visible so keyboard
  // users can Esc / Enter immediately.
  useEffect(() => {
    if (open && mounted) closeBtnRef.current?.focus();
  }, [open, mounted]);

  function onOverlayClick(e: React.MouseEvent) {
    if (!panelRef.current) return;
    if (!panelRef.current.contains(e.target as Node)) {
      onClose();
    }
  }

  if (!mounted || !open) return null;

  const titleId = `lb-modal-title-${variant}`;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onOverlayClick}
      className="fixed inset-0 z-[200] flex items-stretch sm:items-center justify-center sm:px-5 sm:py-10 animate-modal-fade-in"
      style={{
        background: "rgba(10, 10, 10, 0.85)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        ref={panelRef}
        className="relative w-full sm:max-w-[480px] bg-surface sm:border sm:border-border sm:rounded-lg max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto animate-modal-scale-in"
      >
        {/* Sticky close row — pinned while the list scrolls. Bottom
            padding matches the content's top padding so there's clean
            separation from the eyebrow label, no overlap. */}
        <div className="sticky top-0 z-10 flex justify-end px-3 sm:px-4 pt-3 pb-3 bg-surface/85 backdrop-blur-sm">
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 flex items-center justify-center rounded-[4px] text-muted hover:text-foreground hover:bg-border/40 transition text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content block: no negative top margin (the previous -mt-2 was
            dragging the eyebrow behind the sticky close row's translucent
            background). pt-2 gives headroom for Bebas Neue ascenders on
            the title below, which sit slightly above the line-box under
            leading-[0.95]. */}
        <div className="px-6 sm:px-8 pt-2 pb-8 sm:pb-10">
          <div className="font-mono text-[11px] tracking-[3px] uppercase text-spotify mb-4 flex items-center gap-[10px]">
            <span className="w-6 h-px bg-spotify" />
            Leaderboard
          </div>
          <h2
            id={titleId}
            className="font-display tracking-[2px] leading-[0.95] text-spotify mb-8 pt-1"
            style={{ fontSize: "clamp(28px, 6vw, 40px)" }}
          >
            {modeName.toUpperCase()}
            <br />
            LEADERBOARD
          </h2>

          <Section title="All time top 5" rows={allRows} err={err} />
          <div className="h-6" aria-hidden />
          <Section title="Today top 5" rows={todayRows} err={err} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Section({
  title,
  rows,
  err,
}: {
  title: string;
  rows: Row[] | null;
  err: string | null;
}) {
  return (
    <div>
      <div className="font-mono text-[10px] tracking-[2px] uppercase text-muted mb-3 flex items-center gap-[10px]">
        <span className="w-4 h-px bg-border" />
        {title}
      </div>
      {err ? (
        <div className="bg-background border border-border rounded-[4px] p-4 font-mono text-[11px] tracking-[1px] uppercase text-red">
          Couldn&rsquo;t load: {err}
        </div>
      ) : rows === null ? (
        <div className="bg-background border border-border rounded-[4px] p-4 font-mono text-[11px] tracking-[2px] uppercase text-muted">
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-background border border-border rounded-[4px] p-4 font-mono text-[11px] tracking-[2px] uppercase text-muted">
          No scores yet
        </div>
      ) : (
        <ol className="bg-background border border-border rounded-[4px] overflow-hidden">
          {rows.map((r, i) => (
            <li
              key={`${r.player_name}-${i}`}
              className="flex items-center gap-4 px-4 py-3 border-b border-border/60 last:border-b-0"
            >
              <span
                className={`font-display text-[20px] leading-none w-8 shrink-0 ${i === 0 ? "text-spotify" : "text-muted"}`}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="flex-1 truncate text-foreground">
                {r.player_name}
              </span>
              <span className="font-mono text-[13px] text-muted tabular-nums">
                {r.metric.toLocaleString()}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
