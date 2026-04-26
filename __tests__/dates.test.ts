import { test } from "node:test";
import assert from "node:assert/strict";
import { londonDayStartUTC } from "../lib/dates.ts";

// London is UTC+0 (GMT, winter) or UTC+1 (BST, summer). DST switches
// happen on the last Sunday of March (forward) and the last Sunday of
// October (back).

test("londonDayStartUTC: BST date returns prior-day 23:00 UTC", () => {
  assert.equal(
    londonDayStartUTC("2026-04-26"),
    "2026-04-25T23:00:00.000Z",
  );
});

test("londonDayStartUTC: GMT date returns same-day 00:00 UTC", () => {
  assert.equal(
    londonDayStartUTC("2026-01-15"),
    "2026-01-15T00:00:00.000Z",
  );
});

test("londonDayStartUTC: a few BST sample days", () => {
  for (const dateIso of [
    "2026-05-01",
    "2026-06-21",
    "2026-08-15",
    "2026-09-30",
  ]) {
    // BST means London midnight = prior-day 23:00 UTC.
    const [y, m, d] = dateIso.split("-").map(Number);
    const expected = new Date(Date.UTC(y, m - 1, d - 1, 23, 0, 0)).toISOString();
    assert.equal(londonDayStartUTC(dateIso), expected);
  }
});

test("londonDayStartUTC: a few GMT sample days", () => {
  for (const dateIso of [
    "2026-01-01",
    "2026-02-14",
    "2026-11-15",
    "2026-12-25",
  ]) {
    const [y, m, d] = dateIso.split("-").map(Number);
    const expected = new Date(Date.UTC(y, m - 1, d, 0, 0, 0)).toISOString();
    assert.equal(londonDayStartUTC(dateIso), expected);
  }
});
