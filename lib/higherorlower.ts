// Pure helpers for the Higher-or-Lower mode. Lives in /lib so Node's
// test runner can import it without pulling in the React component or
// the `@/` alias chain that next/tsconfig resolves for app code.

export type HLArtist = {
  rank: number;
  artist_name: string;
  spotify_id: string | null;
  image_hash: string | null;
  monthly_listeners: number;
};

export type Pair = readonly [HLArtist, HLArtist];

// Minimum rank gap enforced between the two artists shown in a single
// round. Prevents pairs like rank 320 vs rank 321 where the listener
// counts are near-identical and the guess collapses to a coin flip.
export const MIN_RANK_GAP = 50;

// Fisher-Yates. Non-deterministic by design — per spec, every run should
// be different, so no seeded RNG here.
export function shuffle<T>(input: T[]): T[] {
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Cross-half pairing. Splits the (usually shuffled) input down the
// middle and pairs firstHalf[i] with secondHalf[i]. When that natural
// pairing fails the MIN_RANK_GAP test, walks the second half for any
// unused entry that does satisfy the gap; if none exists, the pair is
// skipped entirely. Each second-half entry is used at most once.
//
// The previous greedy implementation walked the whole shuffled list,
// which biased toward mid-rank artists (they have many valid partners
// and tend to get matched early). Splitting first means every artist
// gets exactly one half-bucket assignment per game, evening out the
// per-artist appearance probability.
export function buildPairs(shuffled: HLArtist[]): Pair[] {
  if (shuffled.length < 2) return [];

  const half = Math.floor(shuffled.length / 2);
  const firstHalf = shuffled.slice(0, half);
  const secondHalf = shuffled.slice(half);
  const usedSecond = new Array<boolean>(secondHalf.length).fill(false);
  const pairs: Pair[] = [];

  for (let i = 0; i < firstHalf.length; i++) {
    const a = firstHalf[i];
    let partnerIdx = -1;

    // Try the same-index partner first — preserves natural shuffle
    // order whenever it already gives a valid pair.
    if (
      i < secondHalf.length &&
      !usedSecond[i] &&
      Math.abs(a.rank - secondHalf[i].rank) >= MIN_RANK_GAP
    ) {
      partnerIdx = i;
    } else {
      // Walk the second half for any unused entry far enough away.
      // First valid match wins; this is the "swap" step.
      for (let j = 0; j < secondHalf.length; j++) {
        if (usedSecond[j]) continue;
        if (Math.abs(a.rank - secondHalf[j].rank) >= MIN_RANK_GAP) {
          partnerIdx = j;
          break;
        }
      }
    }

    if (partnerIdx === -1) continue; // skip this pair, keep going
    usedSecond[partnerIdx] = true;
    pairs.push([a, secondHalf[partnerIdx]] as const);
  }

  return pairs;
}
