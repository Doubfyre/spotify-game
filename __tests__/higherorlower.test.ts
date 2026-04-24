import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPairs,
  shuffle,
  MIN_RANK_GAP,
  type HLArtist,
} from "../lib/higherorlower.ts";

function makeArtist(rank: number): HLArtist {
  return {
    rank,
    artist_name: `Artist ${rank}`,
    spotify_id: null,
    image_hash: null,
    // Monthly listeners don't matter for pair-gap tests; give each a
    // distinct value so nothing accidentally ties.
    monthly_listeners: 1_000_000 - rank,
  };
}

const TOP_500: HLArtist[] = Array.from({ length: 500 }, (_, i) =>
  makeArtist(i + 1),
);

test("every pair in the output is at least MIN_RANK_GAP ranks apart (100 shuffles)", () => {
  for (let run = 0; run < 100; run++) {
    const pairs = buildPairs(shuffle(TOP_500));
    for (const [a, b] of pairs) {
      const gap = Math.abs(a.rank - b.rank);
      assert.ok(
        gap >= MIN_RANK_GAP,
        `run ${run}: pair ${a.rank} / ${b.rank} has gap ${gap} (< ${MIN_RANK_GAP})`,
      );
    }
  }
});

test("each artist is used at most once across all pairs", () => {
  for (let run = 0; run < 50; run++) {
    const pairs = buildPairs(shuffle(TOP_500));
    const seen = new Set<number>();
    for (const [a, b] of pairs) {
      assert.ok(!seen.has(a.rank), `rank ${a.rank} reused in run ${run}`);
      assert.ok(!seen.has(b.rank), `rank ${b.rank} reused in run ${run}`);
      seen.add(a.rank);
      seen.add(b.rank);
    }
  }
});

test("empty input returns no pairs", () => {
  assert.deepEqual(buildPairs([]), []);
});

test("input with no valid pairs (all ranks within MIN_RANK_GAP) returns no pairs", () => {
  // Ranks 1..49 — every pairwise gap is < 50, so no pair is valid.
  const tight = Array.from({ length: 49 }, (_, i) => makeArtist(i + 1));
  assert.deepEqual(buildPairs(tight), []);
});

test("greedy pairing picks the first valid partner in list order", () => {
  // Hand-crafted list: [1, 40, 60, 200].
  //  - i=0 (rank 1): j=1 is rank 40, gap 39 (< 50), skip. j=2 is rank 60,
  //    gap 59 (>= 50), pair (1, 60).
  //  - i=1 (rank 40): only j=3 (rank 200) left. gap 160, pair (40, 200).
  //  - Expected: two pairs, [1,60] and [40,200].
  const input = [1, 40, 60, 200].map(makeArtist);
  const pairs = buildPairs(input);
  assert.equal(pairs.length, 2);
  assert.deepEqual(
    pairs.map((p) => [p[0].rank, p[1].rank]),
    [
      [1, 60],
      [40, 200],
    ],
  );
});

test("stops when first unpaired artist has no valid partner", () => {
  // Ranks [1, 30, 31, 60]. Greedy run:
  //  - i=0 (rank 1): j=1 is 30 (gap 29), j=2 is 31 (gap 30), j=3 is 60
  //    (gap 59, valid) — pair (1, 60).
  //  - i=1 (rank 30): j=2 is 31 (gap 1) — no valid partner remains → stop.
  //  - Result: one pair; ranks 30 and 31 left unpaired.
  const input = [1, 30, 31, 60].map(makeArtist);
  const pairs = buildPairs(input);
  assert.equal(pairs.length, 1);
  assert.deepEqual([pairs[0][0].rank, pairs[0][1].rank], [1, 60]);
});
