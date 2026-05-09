// Per-player results card used on the end screens of Pass & Play and
// Online Party. Pure presentational — both modes shape their pick list
// into ScorecardPick[] before passing it in.

export type ScorecardPick = {
  artistName: string | null;
  rank: number | null;
  points: number;
};

export default function PlayerScorecard({
  name,
  score,
  rank,
  isWinner,
  picks,
}: {
  name: string;
  score: number;
  rank: number;
  isWinner: boolean;
  picks: ScorecardPick[];
}) {
  // Winner card gets a solid spotify-green border + faint tint so the
  // top of the leaderboard reads at a glance.
  const cardClass = isWinner
    ? "bg-surface border border-spotify bg-spotify/5 rounded-lg p-5 sm:p-6"
    : "bg-surface border border-border rounded-lg p-5 sm:p-6";

  return (
    <div className={cardClass}>
      <div className="flex items-baseline gap-3 mb-4">
        <span
          className={`font-display text-[24px] leading-none w-8 shrink-0 ${isWinner ? "text-spotify" : "text-muted"}`}
        >
          {String(rank).padStart(2, "0")}
        </span>
        <span
          className={`flex-1 font-display tracking-[1.5px] leading-none truncate ${isWinner ? "text-spotify" : "text-foreground"}`}
          style={{ fontSize: "clamp(20px, 4vw, 28px)" }}
        >
          {name.toUpperCase()}
        </span>
        <span
          className={`font-display text-[28px] sm:text-[32px] leading-none tabular-nums shrink-0 ${isWinner ? "text-spotify" : "text-foreground"}`}
        >
          {score}
        </span>
      </div>

      {picks.length === 0 ? (
        <div className="font-mono text-[10px] tracking-[2px] uppercase text-muted">
          No picks
        </div>
      ) : (
        <ol className="space-y-1.5">
          {picks.map((pk, i) => (
            <PickRow key={i} pick={pk} />
          ))}
        </ol>
      )}
    </div>
  );
}

function PickRow({ pick }: { pick: ScorecardPick }) {
  // Misses (artist outside top 500 or auto-fail timeout) come through
  // with artist_name=null. Render them as "Not in top 500 · 0pts".
  if (pick.artistName === null || pick.rank === null) {
    return (
      <li className="font-mono text-[11px] tracking-[0.5px] text-muted/80 flex items-center gap-2">
        <span className="italic flex-1 truncate">Not in top 500</span>
        <span aria-hidden>·</span>
        <span className="shrink-0">0pts</span>
      </li>
    );
  }

  // 0-point pick on a matched artist shouldn't happen under current
  // scoring rules (rank = points), but guard the styling so a future
  // 0-point edge case still reads as muted.
  const dim = pick.points === 0;
  return (
    <li
      className={`font-mono text-[11px] tracking-[0.5px] flex items-center gap-2 ${dim ? "text-muted/80" : "text-foreground"}`}
    >
      <span className="flex-1 truncate">{pick.artistName}</span>
      <span className="text-muted/60 shrink-0">— Rank #{pick.rank}</span>
      <span
        className={`shrink-0 ${dim ? "text-muted" : "text-spotify"}`}
      >
        +{pick.points}pts
      </span>
    </li>
  );
}
