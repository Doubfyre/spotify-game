// Shared fuzzy-match helpers. Used by solo play, pass-and-play, and online
// party. Three-pass strategy:
//   1. Exact match on the normalized string.
//   2. Whole-name Levenshtein distance, with a length-scaled cap (see
//      `maxDistanceFor`). Short names get zero tolerance so e.g. "the
//      cars" can't match "the cure" — they're only 2 edits apart but
//      they're different artists. Longer names get more slack.
//   3. "The"-prefix insensitive — strip a leading "the " from both sides
//      and retry passes 1+2. Lets players match "The Weeknd" by typing
//      "weeknd", or "The Rolling Stones" by typing "rolling stones". The
//      edit-distance cap in pass 3 is computed from the stripped query,
//      so short names like "cars" (from "the cars") still get zero
//      tolerance in the stripped comparison.
// Candidates are expected to be sorted by rank ascending so ties go to the
// more popular artist.

export type MatchCandidate = {
  rank: number;
  artist_name: string;
  spotify_id: string | null;
};

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  const curr = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr.slice();
  }
  return prev[n];
}

function stripThe(s: string): string {
  return s.startsWith("the ") ? s.slice(4) : s;
}

// Length-scaled edit-distance cap. Short names have too little information
// for two-character typo tolerance to be safe — at that distance, pairs
// like "the cars" / "the cure" collide. Scale up as names get longer and
// the collision space thins out.
function maxDistanceFor(len: number): number {
  if (len <= 6) return 0;
  if (len <= 10) return 1;
  return 2;
}

export function fuzzyFind<T extends MatchCandidate>(
  rawQuery: string,
  candidates: T[],
): T | null {
  const q = normalize(rawQuery);
  if (!q) return null;

  // Pass 1: exact match on the normalized string.
  for (const a of candidates) {
    if (normalize(a.artist_name) === q) return a;
  }

  // Pass 2: whole-name typo tolerance. Lowest edit distance wins. Cap is
  // length-scaled — maxDistanceFor(0) = 0 means "exact only", which we
  // already covered in pass 1, so skip the walk entirely in that case.
  const maxDist = maxDistanceFor(q.length);
  if (maxDist > 0) {
    let best: T | null = null;
    let bestDist = maxDist + 1;
    for (const a of candidates) {
      const n = normalize(a.artist_name);
      if (Math.abs(n.length - q.length) > maxDist) continue; // cheap prune
      const dist = editDistance(q, n);
      if (dist <= maxDist && dist < bestDist) {
        bestDist = dist;
        best = a;
      }
    }
    if (best) return best;
  }

  // Pass 3: "the "-prefix variations. Strip a leading "the " from both
  // sides and redo the exact + edit-distance comparison. The cap for the
  // edit-distance portion is computed from the stripped query, so "cars"
  // (from "the cars") gets the same zero-tolerance treatment it would
  // get if the user typed "cars" directly.
  const qNoThe = stripThe(q);
  const maxDist3 = maxDistanceFor(qNoThe.length);
  let best3: T | null = null;
  let bestDist3 = maxDist3 + 1;
  for (const a of candidates) {
    const nFull = normalize(a.artist_name);
    const nNoThe = stripThe(nFull);
    // If neither side had a "the " prefix, pass 3 is identical to 1+2 for
    // this candidate — both already failed, skip the redundant work.
    if (qNoThe === q && nNoThe === nFull) continue;
    if (qNoThe === nNoThe) return a;
    if (maxDist3 === 0) continue; // exact-only; already checked above
    if (Math.abs(nNoThe.length - qNoThe.length) > maxDist3) continue;
    const dist = editDistance(qNoThe, nNoThe);
    if (dist <= maxDist3 && dist < bestDist3) {
      bestDist3 = dist;
      best3 = a;
    }
  }
  return best3;
}
