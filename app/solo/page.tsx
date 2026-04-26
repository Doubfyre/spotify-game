// Solo Play leaderboard schema. Run in the Supabase SQL editor:
//
//   create table public.solo_scores (
//     id uuid primary key default gen_random_uuid(),
//     user_id uuid references auth.users(id),
//     player_name text not null check (char_length(player_name) between 1 and 20),
//     score int not null check (score >= 0),
//     created_at timestamptz not null default now()
//   );
//   create index solo_scores_score_idx on public.solo_scores (score desc);
//   create index solo_scores_created_idx on public.solo_scores (created_at desc);
//   grant select, insert on public.solo_scores to anon, authenticated;
//   alter table public.solo_scores enable row level security;
//   create policy "public read" on public.solo_scores for select using (true);
//   create policy "public insert" on public.solo_scores for insert with check (true);
//
// Submit semantics: every completed solo game inserts a fresh row. The
// leaderboard takes MAX(score) per player_name client-side, so a player
// can play repeatedly without losing their record.
//
// IF you previously created the partial unique index from an older
// version of this comment, drop it — it now blocks the second insert
// from a logged-in player and fresh-day submissions stop working:
//
//   drop index if exists public.solo_scores_user_idx;

import { supabase, type ArtistRow } from "@/lib/supabase";
import { getTodayLondon } from "@/lib/dates";
import PageError from "@/app/_components/PageError";
import SoloGame from "./SoloGame";

export const dynamic = "force-dynamic";

export default async function SoloPage() {
  const snapshotDate = getTodayLondon();
  const { data, error } = await supabase
    .from("artist_snapshots")
    .select("rank, artist_name, spotify_id, image_hash")
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

  return <SoloGame artists={data as ArtistRow[]} snapshotDate={snapshotDate} />;
}
