import { test } from "node:test";
import assert from "node:assert/strict";
import { fuzzyFind, type MatchCandidate } from "../lib/fuzzy.ts";

// A small stand-in for today's top 500. Must contain every artist the
// positive tests expect to match, and must NOT contain "The Cars" (so we
// can verify it has no match at all) or any "tay"-prefixed artist short
// enough to false-match "tay".
const candidates: MatchCandidate[] = [
  { rank: 1, artist_name: "Taylor Swift", spotify_id: null },
  { rank: 2, artist_name: "Drake", spotify_id: null },
  { rank: 3, artist_name: "The Weeknd", spotify_id: null },
  { rank: 4, artist_name: "The Rolling Stones", spotify_id: null },
  { rank: 5, artist_name: "The Cure", spotify_id: null },
  { rank: 6, artist_name: "Eminem", spotify_id: null },
  { rank: 7, artist_name: "Bad Bunny", spotify_id: null },
  { rank: 8, artist_name: "Billie Eilish", spotify_id: null },
];

test("'The Cars' does NOT match The Cure", () => {
  // 8-char query, threshold 1 — "the cars" vs "the cure" is edit distance 2.
  // Guards against the original bug this test file was written for.
  const result = fuzzyFind("The Cars", candidates);
  assert.notEqual(result?.artist_name, "The Cure");
});

test("'The Cars' does NOT match any artist", () => {
  assert.equal(fuzzyFind("The Cars", candidates), null);
});

test("'taylor swift' matches Taylor Swift (exact normalised)", () => {
  assert.equal(
    fuzzyFind("taylor swift", candidates)?.artist_name,
    "Taylor Swift",
  );
});

test("'taylor swft' matches Taylor Swift (edit distance 1, long name)", () => {
  // 11-char query, threshold 2. One missing 'i' — distance 1, inside cap.
  assert.equal(
    fuzzyFind("taylor swft", candidates)?.artist_name,
    "Taylor Swift",
  );
});

test("'rolling stones' matches The Rolling Stones (the-prefix strip)", () => {
  assert.equal(
    fuzzyFind("rolling stones", candidates)?.artist_name,
    "The Rolling Stones",
  );
});

test("'weeknd' matches The Weeknd (the-prefix strip, exact)", () => {
  // qNoThe = "weeknd" (6 chars, threshold 0) — pass 3 exact branch catches it.
  assert.equal(fuzzyFind("weeknd", candidates)?.artist_name, "The Weeknd");
});

test("'drake' matches Drake (short exact)", () => {
  assert.equal(fuzzyFind("drake", candidates)?.artist_name, "Drake");
});

test("'tay' does NOT match anything (too short, no tolerance)", () => {
  assert.equal(fuzzyFind("tay", candidates), null);
});
