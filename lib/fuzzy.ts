// Shared fuzzy-match helpers. Used by solo play, pass-and-play, and online
// party. Two-pass strategy:
//   1. Exact match on the normalized string.
//   2. Whole-name Levenshtein distance ≤ 2 (so "taylor swft" matches, but
//      "taylor" alone doesn't match "Taylor Swift").
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

export function fuzzyFind<T extends MatchCandidate>(
  rawQuery: string,
  candidates: T[],
): T | null {
  const q = normalize(rawQuery);
  if (!q) return null;

  for (const a of candidates) {
    if (normalize(a.artist_name) === q) return a;
  }

  let best: T | null = null;
  let bestDist = 3;
  for (const a of candidates) {
    const n = normalize(a.artist_name);
    if (Math.abs(n.length - q.length) > 2) continue;
    const dist = editDistance(q, n);
    if (dist <= 2 && dist < bestDist) {
      bestDist = dist;
      best = a;
    }
  }
  return best;
}
