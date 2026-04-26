// Daily Challenge — 3 seeded artist picks per UTC day, with a 90-day cooldown
// so the same artist doesn't come up twice in a quarter.
//
// Required Supabase tables. Run this in the SQL editor:
//
//   -- Per-day submitted scores (for the leaderboard)
//   create table public.daily_scores (
//     id            uuid primary key default gen_random_uuid(),
//     snapshot_date date not null,
//     user_id       uuid references auth.users(id),
//     player_name   text not null check (char_length(player_name) between 1 and 20),
//     score         int  not null check (score >= 0),
//     created_at    timestamptz not null default now()
//   );
//   create index daily_scores_date_score_idx
//     on public.daily_scores (snapshot_date, score asc);
//   create index daily_scores_user_id_idx on public.daily_scores (user_id);
//   grant select, insert, update on table public.daily_scores to anon, authenticated;
//   grant all                     on table public.daily_scores to service_role;
//   alter table public.daily_scores enable row level security;
//   create policy "public read"   on public.daily_scores for select using (true);
//   create policy "public insert" on public.daily_scores for insert with check (true);
//   -- Updates are scoped to the row owner: the unconditional "public update"
//   -- policy let any client rewrite anyone's score, which is unacceptable
//   -- once user_id is populated. This restricts UPDATE to rows the caller
//   -- owns AND requires the post-update row to still belong to them.
//   create policy "users update own row" on public.daily_scores
//     for update using (user_id = auth.uid()) with check (user_id = auth.uid());
//
// If you previously created the open "public update" policy, drop it
// before applying the scoped one (idempotent if either is missing):
//
//   drop policy if exists "public update" on public.daily_scores;
//   create policy "users update own row" on public.daily_scores
//     for update using (user_id = auth.uid()) with check (user_id = auth.uid());
//
//   -- Dedupe: at most one row per signed-in player per day. Partial
//   -- index so anonymous submissions (user_id NULL) aren't constrained.
//   -- Required for the ON CONFLICT (user_id, snapshot_date) upsert in
//   -- DailyChallenge.tsx.
//   create unique index daily_scores_user_day_idx
//     on public.daily_scores (user_id, snapshot_date) where user_id is not null;
//
// One-time cleanup before creating the unique index if the table has
// duplicate (user_id, snapshot_date) rows — keep the best (lowest)
// score per user per day:
//
//   with ranked as (
//     select id,
//            row_number() over (partition by user_id, snapshot_date order by score asc, created_at asc) as rn
//     from public.daily_scores
//     where user_id is not null
//   )
//   delete from public.daily_scores where id in (select id from ranked where rn > 1);
//
//   -- Artists already used in a daily challenge (cooldown ledger).
//   -- unique(spotify_id, used_on) lets the server safely re-insert on
//   -- repeat renders via Prefer: resolution=ignore-duplicates.
//   create table public.used_artists (
//     id          uuid primary key default gen_random_uuid(),
//     spotify_id  text not null,
//     artist_name text not null,
//     used_on     date not null,
//     created_at  timestamptz not null default now(),
//     unique (spotify_id, used_on)
//   );
//   create index used_artists_used_on_idx    on public.used_artists (used_on desc);
//   create index used_artists_spotify_id_idx on public.used_artists (spotify_id);
//
//   -- Reads are fine from the browser (nothing sensitive). Writes are
//   -- server-only via SUPABASE_SERVICE_ROLE_KEY — no public insert policy,
//   -- otherwise any visitor could poison the cooldown ledger.
//   grant select on table public.used_artists to anon, authenticated;
//   grant all    on table public.used_artists to service_role;
//   alter table public.used_artists enable row level security;
//   create policy "public read" on public.used_artists for select using (true);

import Link from "next/link";
import { supabase, type ArtistRow } from "@/lib/supabase";
import { createServerSupabase } from "@/lib/supabase-server";
import { getTodayLondon } from "@/lib/dates";
import DailyChallenge, { type ArtistPick } from "./DailyChallenge";

export const dynamic = "force-dynamic";

const COOLDOWN_DAYS = 90;
const PICKS_PER_DAY = 3;

// FNV-1a over the ISO date gives us a stable 32-bit seed for the day.
function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32 — tiny, fast, deterministic PRNG.
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pick n distinct items. Deterministic for a given (arr, rand).
function pickN<T>(arr: T[], rand: () => number, n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(rand() * copy.length);
    out.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return out;
}

// Subtract `days` from a YYYY-MM-DD date string in UTC.
function dateSubtract(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// Record today's picks in `used_artists` via the PostgREST endpoint with the
// service_role key. The table has a unique(spotify_id, used_on) constraint, so
// `Prefer: resolution=ignore-duplicates` makes repeat renders on the same day
// a no-op instead of an error.
//
// Failures are logged but do not block the page — a one-off write failure is
// less bad than blocking play entirely. Callers should expect at-most-once
// semantics under normal operation.
async function recordUsedArtists(
  picks: Array<{ spotify_id: string; artist_name: string }>,
  usedOn: string,
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.warn(
      "recordUsedArtists: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is unset; skipping cooldown write.",
    );
    return;
  }
  if (picks.length === 0) return;
  const rows = picks.map((p) => ({
    spotify_id: p.spotify_id,
    artist_name: p.artist_name,
    used_on: usedOn,
  }));
  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/used_artists`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    });
    if (!res.ok) {
      const body = await res.text();
      console.warn(
        `recordUsedArtists: ${res.status} ${res.statusText} — ${body}`,
      );
    }
  } catch (err) {
    console.warn("recordUsedArtists: network error —", err);
  }
}

export default async function DailyPage() {
  const snapshotDate = getTodayLondon();

  // 1. Today's top 500.
  const { data: artistData, error: artistErr } = await supabase
    .from("artist_snapshots")
    .select("rank, artist_name, spotify_id, image_hash")
    .eq("snapshot_date", snapshotDate)
    .lte("rank", 500)
    .order("rank", { ascending: true });

  if (artistErr) {
    return (
      <ErrorState title="Couldn't load artists" detail={artistErr.message} />
    );
  }
  if (!artistData || artistData.length === 0) {
    return (
      <ErrorState
        title="No snapshot for today"
        detail={`No rows found in artist_snapshots for ${snapshotDate}. Run "npm run scrape" and try again.`}
      />
    );
  }

  // 2. Artists used in the last 90 days (excluding today, so repeat renders
  //    of the same date don't shrink their own pool — keeps picks stable).
  const cutoff = dateSubtract(snapshotDate, COOLDOWN_DAYS);
  const { data: usedData, error: usedErr } = await supabase
    .from("used_artists")
    .select("spotify_id")
    .gt("used_on", cutoff)
    .lt("used_on", snapshotDate);

  if (usedErr) {
    return (
      <ErrorState
        title="Couldn't load cooldown ledger"
        detail={`${usedErr.message} — check that the used_artists table exists (SQL is in a comment at the top of app/daily/page.tsx).`}
      />
    );
  }
  const excluded = new Set(
    (usedData ?? [])
      .map((r) => r.spotify_id)
      .filter((id): id is string => typeof id === "string"),
  );

  // 3. Build the eligible pool. An artist without a spotify_id can't be
  //    tracked in the cooldown ledger, so drop those to keep the invariant.
  const rows = artistData as ArtistRow[];
  const pool = rows.filter(
    (a): a is ArtistRow & { spotify_id: string } =>
      typeof a.spotify_id === "string" && !excluded.has(a.spotify_id),
  );
  if (pool.length < PICKS_PER_DAY) {
    return (
      <ErrorState
        title="Pool exhausted"
        detail={`Only ${pool.length} eligible artists after the ${COOLDOWN_DAYS}-day cooldown — can't pick ${PICKS_PER_DAY}.`}
      />
    );
  }

  // 4. Seeded pick of 3 distinct artists from the full pool.
  const rand = mulberry32(seedFromString(snapshotDate));
  const picks = pickN(pool, rand, PICKS_PER_DAY);

  // 5. Record them so tomorrow's filter includes them.
  await recordUsedArtists(
    picks.map((p) => ({
      spotify_id: p.spotify_id,
      artist_name: p.artist_name,
    })),
    snapshotDate,
  );

  // Strip spotify_id before handing to the client — it doesn't need it —
  // but pass image_hash through so the reveal can show the artist's photo.
  const clientPicks: ArtistPick[] = picks.map((p) => ({
    rank: p.rank,
    artist_name: p.artist_name,
    image_hash: p.image_hash,
  }));

  // Cross-device replay gate: if the player is logged in and has already
  // submitted a row for today's snapshot on any device, mark them as done
  // so the client skips straight to the results screen. Logged-out users
  // rely on the existing localStorage check in DailyChallenge.
  let alreadyPlayed = false;
  let existingScore: number | null = null;
  let existingName: string | null = null;
  const authSupabase = await createServerSupabase();
  const { data: authData, error: authErr } = await authSupabase.auth.getUser();
  const user = authData?.user ?? null;
  if (authErr) {
    console.warn("[daily-gate] auth.getUser error —", authErr.message);
  }
  if (user) {
    // Use .limit(1) + array read instead of .maybeSingle() so the gate
    // is robust even if the partial unique index hasn't been created yet
    // and there's more than one row for this (user, day) combo.
    const { data: existingRows, error: gateErr } = await authSupabase
      .from("daily_scores")
      .select("score, player_name")
      .eq("user_id", user.id)
      .eq("snapshot_date", snapshotDate)
      .order("created_at", { ascending: false })
      .limit(1);

    if (gateErr) {
      console.error(
        `[daily-gate] query failed for user_id=${user.id} snapshot=${snapshotDate} —`,
        gateErr.message,
      );
    }
    const existing = (existingRows ?? [])[0] as
      | { score: number; player_name: string | null }
      | undefined;

    if (existing) {
      alreadyPlayed = true;
      existingScore = existing.score;
      existingName = existing.player_name;
    }
  }

  return (
    <DailyChallenge
      picks={clientPicks}
      snapshotDate={snapshotDate}
      alreadyPlayed={alreadyPlayed}
      existingScore={existingScore}
      existingName={existingName}
    />
  );
}

function ErrorState({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="flex-1 flex items-center justify-center px-5 sm:px-10 pt-32 pb-16">
      <div className="w-full max-w-lg bg-surface border border-border rounded-lg p-10 text-center">
        <div className="font-mono text-[11px] tracking-[3px] uppercase text-muted mb-4">
          Error
        </div>
        <h1
          className="font-display leading-none tracking-[2px] text-foreground"
          style={{ fontSize: "clamp(40px, 6vw, 64px)" }}
        >
          {title}
        </h1>
        <p className="text-muted mt-4 mb-8">{detail}</p>
        <Link
          href="/"
          className="inline-block border border-border text-foreground rounded-[4px] px-6 py-3 text-sm hover:border-foreground transition"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
