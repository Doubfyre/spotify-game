// Higher or Lower — two artists side-by-side, pick the one with more
// monthly listeners. Streak-based scoring with a per-user best saved to
// profiles.higher_lower_best_streak.
//
// Required Supabase migration:
//
//   ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS higher_lower_best_streak int;
//
// The column is nullable on purpose — null means "no best yet", which lets
// the atomic conditional UPDATE (see HigherOrLowerGame.tsx) match rows
// that have never recorded a streak without a separate insert path.

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
