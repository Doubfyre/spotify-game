// All game-mode snapshots are keyed on the *London* calendar date, so every
// mode refreshes at midnight UK (BST in summer, GMT in winter). These
// helpers use `Intl.DateTimeFormat` with a named IANA timezone, which
// handles DST automatically — no hand-rolled offset table.

/**
 * Today's date in Europe/London as YYYY-MM-DD. Safe to call from both
 * server and client.
 */
export function getTodayLondon(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const d = parts.find((p) => p.type === "day")?.value ?? "";
  return `${y}-${m}-${d}`;
}

/**
 * Add (or subtract) whole days from a YYYY-MM-DD string. Uses UTC
 * arithmetic — we're incrementing a calendar date, not an instant, so DST
 * doesn't come into play.
 */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Tomorrow in London. Used by the scheduled scraper (which runs at 10pm UTC
 * — i.e., 1–2 hours before London midnight — and writes the snapshot that
 * the app will read throughout the *next* London day).
 */
export function getTomorrowLondon(): string {
  return addDays(getTodayLondon(), 1);
}

/**
 * Returns an ISO UTC timestamp for 00:00 London time on the given
 * YYYY-MM-DD. Used to filter leaderboard queries by "today" while
 * respecting the London rollover (so the TODAY tab matches the rest of
 * the app's daily-reset semantics). London is UTC+0 (GMT, winter) or
 * UTC+1 (BST, summer) — we probe both candidates and pick the one that
 * actually formats to midnight in London.
 */
export function londonDayStartUTC(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  for (const offsetHours of [0, -1]) {
    const candidate = new Date(Date.UTC(y, m - 1, d, offsetHours, 0, 0));
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(candidate);
    const ly = parts.find((p) => p.type === "year")?.value ?? "";
    const lm = parts.find((p) => p.type === "month")?.value ?? "";
    const ld = parts.find((p) => p.type === "day")?.value ?? "";
    const lh = parts.find((p) => p.type === "hour")?.value ?? "";
    const lmin = parts.find((p) => p.type === "minute")?.value ?? "";
    if (`${ly}-${lm}-${ld}` === dateIso && lh === "00" && lmin === "00") {
      return candidate.toISOString();
    }
  }
  // DST transition edge case — fall back to UTC midnight of the date.
  // Off by an hour on the two switchover days; fine for a TODAY cutoff.
  return new Date(Date.UTC(y, m - 1, d)).toISOString();
}

/**
 * Milliseconds until the next Europe/London midnight. Feeds the homepage
 * countdown.
 *
 * Caveat: on the twice-a-year DST switchover days, London has a 23- or 25-
 * hour day; this approximation (24h minus elapsed seconds) can be off by up
 * to an hour on those days. Fine for a visual countdown.
 */
export function msUntilLondonMidnight(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/London",
    hourCycle: "h23", // 00–23, guarantees no "24:..." edge cases
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const s = Number(parts.find((p) => p.type === "second")?.value ?? 0);
  const elapsed = h * 3600 + m * 60 + s;
  return Math.max(0, (24 * 3600 - elapsed) * 1000);
}
