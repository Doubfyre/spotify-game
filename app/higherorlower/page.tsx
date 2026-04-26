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
//   grant select, insert on public.higher_lower_scores to anon, authenticated;
//   alter table public.higher_lower_scores enable row level security;
//   create policy "public read" on public.higher_lower_scores for select using (true);
//   create policy "public insert" on public.higher_lower_scores for insert with check (true);
//
// Submit semantics: every completed run inserts a fresh row. The
// leaderboard takes MAX(streak) per player_name client-side so a
// player can replay without losing their record.
//
// IF you previously created the partial unique index from an older
// version of this comment, drop it — it now blocks the second insert
// from a logged-in player and replays stop working:
//
//   drop index if exists public.higher_lower_scores_user_idx;

import { supabase } from "@/lib/supabase";
import { getTodayLondon } from "@/lib/dates";
import PageError from "@/app/_components/PageError";
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
    return <PageError title="Couldn't load artists" detail={error.message} />;
  }
  if (!data || data.length === 0) {
    return (
      <PageError
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
      <PageError
        title="Not enough data"
        detail="Today's snapshot doesn't have enough artists with monthly listener counts to play."
      />
    );
  }

  return <HigherOrLowerGame artists={artists} snapshotDate={snapshotDate} />;
}
