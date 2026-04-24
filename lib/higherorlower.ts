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

// Greedy pairing over a (usually shuffled) list. For each still-unpaired
// artist walking the list order, find the next unpaired artist whose
// rank is ≥ MIN_RANK_GAP away; mark both used; move on. If no valid
// partner exists for the current artist, stop — the remaining artists
// aren't playable as a pair and the run ends there.
export function buildPairs(shuffled: HLArtist[]): Pair[] {
  const used = new Array<boolean>(shuffled.length).fill(false);
  const pairs: Pair[] = [];
  for (let i = 0; i < shuffled.length; i++) {
    if (used[i]) continue;
    const a = shuffled[i];
    let partnerIdx = -1;
    for (let j = i + 1; j < shuffled.length; j++) {
      if (used[j]) continue;
      if (Math.abs(a.rank - shuffled[j].rank) >= MIN_RANK_GAP) {
        partnerIdx = j;
        break;
      }
    }
    if (partnerIdx === -1) break;
    used[i] = true;
    used[partnerIdx] = true;
    pairs.push([a, shuffled[partnerIdx]] as const);
  }
  return pairs;
}
