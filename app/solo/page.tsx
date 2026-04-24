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
//   grant select, insert, update on public.solo_scores to anon, authenticated;
//   alter table public.solo_scores enable row level security;
//   create policy "public read" on public.solo_scores for select using (true);
//   create policy "public insert" on public.solo_scores for insert with check (true);
//   create policy "public update" on public.solo_scores for update using (true);
//
//   -- Dedupe: one leaderboard row per signed-in player. Partial index so
//   -- anonymous submissions (user_id NULL) aren't constrained. Required
//   -- for the ON CONFLICT (user_id) upsert in SoloGame.tsx.
//   create unique index solo_scores_user_idx on public.solo_scores (user_id) where user_id is not null;
//
// One-time cleanup if the table already has multiple rows per user from
// the old insert-every-game flow — keep the best row per user, delete
// the rest. Safe to run before or after creating the unique index, but
// the index creation will fail if duplicates still exist, so run this
// first:
//
//   with ranked as (
//     select id,
//            row_number() over (partition by user_id order by score desc, created_at asc) as rn
//     from public.solo_scores
//     where user_id is not null
//   )
//   delete from public.solo_scores where id in (select id from ranked where rn > 1);

import Link from "next/link";
import { supabase, type ArtistRow } from "@/lib/supabase";
import { getTodayLondon } from "@/lib/dates";
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

  return <SoloGame artists={data as ArtistRow[]} snapshotDate={snapshotDate} />;
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
