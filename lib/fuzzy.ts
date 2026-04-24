// Shared fuzzy-match helpers. Used by solo play, pass-and-play, and online
// party. Three-pass strategy:
//   1. Exact match on the normalized string.
//   2. Whole-name Levenshtein distance ≤ 2 (so "taylor swft" matches, but
//      "taylor" alone doesn't match "Taylor Swift").
//   3. "The"-prefix insensitive — strip a leading "the " from both sides
//      and retry passes 1+2. Lets players match "The Weeknd" by typing
//      "weeknd", or "The Rolling Stones" by typing "rolling stones".
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

  // Pass 2: whole-name typo tolerance. Lowest edit distance wins; cap at 2.
  let best: T | null = null;
  let bestDist = 3;
  for (const a of candidates) {
    const n = normalize(a.artist_name);
    if (Math.abs(n.length - q.length) > 2) continue; // cheap prune
    const dist = editDistance(q, n);
    if (dist <= 2 && dist < bestDist) {
      bestDist = dist;
      best = a;
    }
  }
  if (best) return best;

  // Pass 3: "the "-prefix variations. Strip a leading "the " from both
  // sides and redo the exact + edit-distance comparison.
  const qNoThe = stripThe(q);
  let best3: T | null = null;
  let bestDist3 = 3;
  for (const a of candidates) {
    const nFull = normalize(a.artist_name);
    const nNoThe = stripThe(nFull);
    // If neither side had a "the " prefix, pass 3 is identical to 1+2 for
    // this candidate — both already failed, skip the redundant work.
    if (qNoThe === q && nNoThe === nFull) continue;
    if (qNoThe === nNoThe) return a;
    if (Math.abs(nNoThe.length - qNoThe.length) > 2) continue;
    const dist = editDistance(qNoThe, nNoThe);
    if (dist <= 2 && dist < bestDist3) {
      bestDist3 = dist;
      best3 = a;
    }
  }
  return best3;
}
