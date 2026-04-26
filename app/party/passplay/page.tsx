import { supabase, type ArtistRow } from "@/lib/supabase";
import { getTodayLondon } from "@/lib/dates";
import PageError from "@/app/_components/PageError";
import PassPlayGame from "./PassPlayGame";

export const dynamic = "force-dynamic";

export default async function PassPlayPage() {
  const snapshotDate = getTodayLondon();
  const { data, error } = await supabase
    .from("artist_snapshots")
    .select("rank, artist_name, spotify_id, image_hash")
    .eq("snapshot_date", snapshotDate)
    .lte("rank", 500)
    .order("rank", { ascending: true });

  if (error) {
    return (
      <PageError
        title="Couldn't load artists"
        detail={error.message}
        backHref="/party"
        backLabel="Back to Party"
      />
    );
  }
  if (!data || data.length === 0) {
    return (
      <PageError
        title="No snapshot for today"
        detail={`No rows in artist_snapshots for ${snapshotDate}. Run "npm run scrape" and try again.`}
        backHref="/party"
        backLabel="Back to Party"
      />
    );
  }

  return (
    <PassPlayGame artists={data as ArtistRow[]} snapshotDate={snapshotDate} />
  );
}
