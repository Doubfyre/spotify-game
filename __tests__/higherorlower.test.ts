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

test("single-artist input returns no pairs", () => {
  assert.deepEqual(buildPairs([makeArtist(42)]), []);
});

test("input with no valid pairs (all ranks within MIN_RANK_GAP) returns no pairs", () => {
  // Ranks 1..49 — every pairwise gap is < 50, so no pair can satisfy
  // the cross-half scan either.
  const tight = Array.from({ length: 49 }, (_, i) => makeArtist(i + 1));
  assert.deepEqual(buildPairs(tight), []);
});

test("cross-half pairing pairs same-index when the gap is satisfied", () => {
  // Hand-crafted "shuffled" input. half=2 so:
  //   firstHalf = [10, 100], secondHalf = [200, 300]
  //   i=0: 10 ↔ 200 (gap 190) ✓
  //   i=1: 100 ↔ 300 (gap 200) ✓
  const input = [10, 100, 200, 300].map(makeArtist);
  const pairs = buildPairs(input);
  assert.deepEqual(
    pairs.map((p) => [p[0].rank, p[1].rank]),
    [
      [10, 200],
      [100, 300],
    ],
  );
});

test("swaps within the second half when same-index pair fails the gap", () => {
  // half=2 so firstHalf=[10, 50], secondHalf=[30, 70].
  //   i=0: 10 ↔ 30 fails (gap 20). Walk secondHalf for valid:
  //        j=0 fails, j=1 (rank 70) gap 60 ✓ → pair (10, 70). Mark j=1.
  //   i=1: same-index secondHalf[1] is used. Walk:
  //        j=0 (rank 30) gap 20 ✗, j=1 used. No partner → skip.
  //   Result: 1 pair, (10, 70). Rank 50 is dropped.
  const input = [10, 50, 30, 70].map(makeArtist);
  const pairs = buildPairs(input);
  assert.equal(pairs.length, 1);
  assert.deepEqual([pairs[0][0].rank, pairs[0][1].rank], [10, 70]);
});

test("swap rescues both pairs when natural ordering fails one of them", () => {
  // half=2 so firstHalf=[10, 100], secondHalf=[30, 200].
  //   i=0: 10 ↔ 30 fails (gap 20). Walk:
  //        j=1 (rank 200) gap 190 ✓ → pair (10, 200). Mark j=1.
  //   i=1: 100 ↔ secondHalf[1] used. Walk:
  //        j=0 (rank 30) gap 70 ✓ → pair (100, 30).
  //   Result: 2 pairs.
  const input = [10, 100, 30, 200].map(makeArtist);
  const pairs = buildPairs(input);
  assert.equal(pairs.length, 2);
  assert.deepEqual(pairs.map((p) => [p[0].rank, p[1].rank]), [
    [10, 200],
    [100, 30],
  ]);
});

test("a skipped pair does not break later pairs", () => {
  // half=3 so firstHalf=[10, 25, 100], secondHalf=[20, 30, 200].
  //   i=0: 10 ↔ 20 fails (gap 10). Walk: j=1 (30) gap 20 ✗,
  //        j=2 (200) gap 190 ✓ → pair (10, 200).
  //   i=1: 25 ↔ secondHalf[1]=30 fails (gap 5). Walk: j=0 (20) gap 5 ✗,
  //        j=1 (30) gap 5 ✗, j=2 used. No partner → skip.
  //   i=2: 100 ↔ secondHalf[2] used. Walk: j=0 (20) gap 80 ✓ → pair (100, 20).
  //   Result: 2 pairs even though i=1 had to skip.
  const input = [10, 25, 100, 20, 30, 200].map(makeArtist);
  const pairs = buildPairs(input);
  assert.equal(pairs.length, 2);
  assert.deepEqual(pairs.map((p) => [p[0].rank, p[1].rank]), [
    [10, 200],
    [100, 20],
  ]);
});

test("appearance frequency is roughly uniform across many shuffles", () => {
  // Distributional sanity: across many independent runs, every rank
  // should appear in a comparable fraction of pairs. The cross-half
  // split guarantees each rank lands in firstHalf vs secondHalf with
  // probability 1/2; combined with a generous valid-partner pool, the
  // per-rank appearance rate should sit close to the all-rank average.
  //
  // Tolerance is loose because 200 runs of 250 pairs each isn't a huge
  // sample; we're only catching gross bias, not proving uniformity.
  const RUNS = 200;
  const counts = new Map<number, number>();
  for (let run = 0; run < RUNS; run++) {
    const pairs = buildPairs(shuffle(TOP_500));
    for (const [a, b] of pairs) {
      counts.set(a.rank, (counts.get(a.rank) ?? 0) + 1);
      counts.set(b.rank, (counts.get(b.rank) ?? 0) + 1);
    }
  }
  const values = Array.from({ length: 500 }, (_, i) => counts.get(i + 1) ?? 0);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  // Every rank should appear at least 60% as often as the mean and
  // never more than ~1.6× the mean. Bias would blow these out.
  assert.ok(min >= mean * 0.6, `min appearances ${min} far below mean ${mean}`);
  assert.ok(max <= mean * 1.6, `max appearances ${max} far above mean ${mean}`);
});
