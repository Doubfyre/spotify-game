# Cron timing notes

The scheduled scraper in `vercel.json` runs at `0 22 * * *` — **22:00 UTC daily**.

## Why 22:00 UTC?

The app treats Europe/London as its canonical timezone: every game mode
resets at midnight UK. In summer (BST, UTC+1) that's 23:00 UTC; in winter
(GMT, UTC+0) it's 00:00 UTC the following day. Picking 22:00 UTC puts the
scraper **1–2 hours before London midnight in both seasons**:

| Season | UTC offset | 22:00 UTC = London local | London midnight |
| ------ | ---------- | ------------------------ | --------------- |
| BST    | UTC+1      | 23:00 (same day)         | 23:00 UTC       |
| GMT    | UTC+0      | 22:00 (same day)         | 00:00 UTC next day |

That buffer means today's snapshot is always written to the DB before the
UK day rolls over, avoiding a data gap at the transition.

## Why not a named timezone?

Vercel Cron schedules are **always UTC**. Named IANA timezones (like
`Europe/London`) aren't supported in the schedule string, so we can't say
"23:00 London daily" directly. 22:00 UTC is the value that works in both
DST seasons without needing to reconfigure twice a year.

## Where the "tomorrow's London date" labelling happens

`app/api/cron/scrape/route.ts` calls `getTomorrowLondon()` (from
`lib/dates.ts`) when writing `snapshot_date`. Since the cron fires 1–2 hours
before London midnight, the rows it writes are in effect for the *next*
London day.

`scripts/scrape.js` (manual CLI) defaults to **today's** London date
instead, matching the expected semantics for "fill in today's data". Use
`SNAPSHOT_DATE=YYYY-MM-DD npm run scrape` to override explicitly.
