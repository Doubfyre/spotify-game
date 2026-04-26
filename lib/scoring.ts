// Shared scoring helpers. The single source of truth for how a Spotify
// rank converts to game points. Used by Solo Play, Pass & Play, and
// Online Party — all three apply the same rule: rank == points,
// outside-top-500 == 0.

/**
 * Returns the point value for a guessed artist's rank.
 *  - Inside the top 500 (1..500): the rank itself.
 *  - Anything else (null, < 1, > 500): 0.
 *
 * Higher is better. The maximum on a single guess is 500.
 */
export function pointsForRank(rank: number | null): number {
  if (rank === null || rank < 1 || rank > 500) return 0;
  return rank;
}
