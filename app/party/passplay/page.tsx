import Link from "next/link";
import { supabase, todayUtcDate, type ArtistRow } from "@/lib/supabase";
import PassPlayGame from "./PassPlayGame";

export const dynamic = "force-dynamic";

export default async function PassPlayPage() {
  const snapshotDate = todayUtcDate();
  const { data, error } = await supabase
    .from("artist_snapshots")
    .select("rank, artist_name, spotify_id")
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
        detail={`No rows in artist_snapshots for ${snapshotDate}. Run "npm run scrape" and try again.`}
      />
    );
  }

  return (
    <PassPlayGame artists={data as ArtistRow[]} snapshotDate={snapshotDate} />
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
          href="/party"
          className="inline-block border border-border text-foreground rounded-[4px] px-6 py-3 text-sm hover:border-foreground transition"
        >
          Back to Party
        </Link>
      </div>
    </main>
  );
}
