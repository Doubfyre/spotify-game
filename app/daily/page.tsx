// Daily Challenge — 3 seeded artist picks per UTC day.
//
// Required Supabase table. Run this in the SQL editor:
//
//   create table public.daily_scores (
//     id            uuid primary key default gen_random_uuid(),
//     snapshot_date date not null,
//     player_name   text not null check (char_length(player_name) between 1 and 20),
//     score         int  not null check (score >= 0),
//     created_at    timestamptz not null default now()
//   );
//
//   create index daily_scores_date_score_idx
//     on public.daily_scores (snapshot_date, score asc);
//
//   -- Grants (service_role already has ALL via Supabase defaults; make sure
//   -- anon + authenticated can read and insert):
//   grant select, insert on table public.daily_scores to anon, authenticated;
//   grant all          on table public.daily_scores to service_role;
//
//   -- RLS:
//   alter table public.daily_scores enable row level security;
//   create policy "public read"   on public.daily_scores for select using (true);
//   create policy "public insert" on public.daily_scores for insert with check (true);

import Link from "next/link";
import { supabase, todayUtcDate } from "@/lib/supabase";
import DailyChallenge, { type ArtistPick } from "./DailyChallenge";

export const dynamic = "force-dynamic";

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

function pickInRange(
  rows: ArtistPick[],
  rand: () => number,
  min: number,
  max: number,
): ArtistPick | null {
  const subset = rows.filter((r) => r.rank >= min && r.rank <= max);
  if (subset.length === 0) return null;
  return subset[Math.floor(rand() * subset.length)];
}

export default async function DailyPage() {
  const snapshotDate = todayUtcDate();
  const { data, error } = await supabase
    .from("artist_snapshots")
    .select("rank, artist_name")
    .eq("snapshot_date", snapshotDate)
    .lte("rank", 500)
    .order("rank", { ascending: true });

  if (error) {
    return <ErrorState title="Couldn't load artists" detail={error.message} />;
  }
  if (!data || data.length === 0) {
    return (
      <ErrorState
        title="No snapshot for today"
        detail={`No rows found in artist_snapshots for ${snapshotDate}. Run "npm run scrape" and try again.`}
      />
    );
  }

  const rows = data as ArtistPick[];
  const rand = mulberry32(seedFromString(snapshotDate));
  const picks = [
    pickInRange(rows, rand, 1, 100),
    pickInRange(rows, rand, 101, 350),
    pickInRange(rows, rand, 351, 500),
  ];
  if (picks.some((p) => p === null)) {
    return (
      <ErrorState
        title="Not enough artists"
        detail={`Today's snapshot is missing one of the rank bands (1–100, 101–350, 351–500).`}
      />
    );
  }

  return (
    <DailyChallenge
      picks={picks as ArtistPick[]}
      snapshotDate={snapshotDate}
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
