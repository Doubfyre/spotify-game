// Higher or Lower — two artists side-by-side, pick the one with more
// monthly listeners. Streak-based scoring with a per-user best saved to
// profiles.higher_lower_best_streak and a public leaderboard table.
//
// Required Supabase migration:
//
//   ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS higher_lower_best_streak int;
//
// The column is nullable on purpose — null means "no best yet", which lets
// the atomic conditional UPDATE (see HigherOrLowerGame.tsx) match rows
// that have never recorded a streak without a separate insert path.
//
// Public leaderboard table. Run in the Supabase SQL editor:
//
//   create table public.higher_lower_scores (
//     id uuid primary key default gen_random_uuid(),
//     user_id uuid references auth.users(id),
//     player_name text not null check (char_length(player_name) between 1 and 20),
//     streak int not null check (streak >= 0),
//     created_at timestamptz not null default now()
//   );
//   create index higher_lower_scores_streak_idx on public.higher_lower_scores (streak desc);
//   create index higher_lower_scores_created_idx on public.higher_lower_scores (created_at desc);
//   grant select, insert, update on public.higher_lower_scores to anon, authenticated;
//   alter table public.higher_lower_scores enable row level security;
//   create policy "public read" on public.higher_lower_scores for select using (true);
//   create policy "public insert" on public.higher_lower_scores for insert with check (true);
//   create policy "public update" on public.higher_lower_scores for update using (true);
//
//   -- Dedupe: one leaderboard row per signed-in player. Partial index so
//   -- anonymous submissions (user_id NULL) aren't constrained. Required
//   -- for the ON CONFLICT (user_id) upsert in HigherOrLowerGame.tsx.
//   create unique index higher_lower_scores_user_idx
//     on public.higher_lower_scores (user_id) where user_id is not null;
//
// One-time cleanup if the table already has multiple rows per user from
// the old insert-every-run flow. Run BEFORE creating the unique index
// (the index creation will fail if duplicates still exist).
//
//   with ranked as (
//     select id,
//            row_number() over (partition by user_id order by streak desc, created_at asc) as rn
//     from public.higher_lower_scores
//     where user_id is not null
//   )
//   delete from public.higher_lower_scores where id in (select id from ranked where rn > 1);

import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getTodayLondon } from "@/lib/dates";
import HigherOrLowerGame, { type HLArtist } from "./HigherOrLowerGame";

export const dynamic = "force-dynamic";

export default async function HigherOrLowerPage() {
  const snapshotDate = getTodayLondon();
  const { data, error } = await supabase
    .from("artist_snapshots")
    .select("rank, artist_name, spotify_id, image_hash, monthly_listeners")
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

  // Drop rows with missing monthly_listeners — the whole game premise is
  // comparing that number, so an artist without one can't participate.
  const artists = (data as HLArtist[]).filter(
    (a) => typeof a.monthly_listeners === "number" && a.monthly_listeners > 0,
  );

  if (artists.length < 2) {
    return (
      <ErrorState
        title="Not enough data"
        detail="Today's snapshot doesn't have enough artists with monthly listener counts to play."
      />
    );
  }

  return <HigherOrLowerGame artists={artists} snapshotDate={snapshotDate} />;
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
