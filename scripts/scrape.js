// Scrapes the top 500 artists by Spotify monthly listeners from
// music.eduardlupu.com and upserts a dated snapshot into Supabase.
//
// Usage:
//   node scripts/scrape.js            # today's date (Europe/London)
//   SNAPSHOT_DATE=2026-04-22 node scripts/scrape.js
//
// Required env (loaded from .env.local):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// One-time DB migration (run in Supabase SQL editor):
//   ALTER TABLE public.artist_snapshots ADD COLUMN IF NOT EXISTS image_hash text;

const fs = require('node:fs');
const path = require('node:path');

const SOURCE_URL = 'https://music.eduardlupu.com/data/latest/top500.json';
const TOP_N = 500;
// PostgREST batches larger than a few thousand rows can time out; 500 is well
// under the limit but we chunk anyway to keep payloads small.
const UPSERT_CHUNK = 500;

// Indexes into each `row` entry in the source JSON. Matches the `fields`
// array the API documents: ["i","n","p","r","ml", …].
const IDX = {
  spotify_id: 0,
  artist_name: 1,
  image_hash: 2,
  rank: 3,
  monthly_listeners: 4,
};

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

// Today's date in Europe/London as YYYY-MM-DD. Inlined here because this
// CLI runs under plain `node` without a TS loader; the canonical version
// lives in lib/dates.ts. Keep the two in sync.
function getTodayLondon() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year').value;
  const m = parts.find((p) => p.type === 'month').value;
  const d = parts.find((p) => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'spotify-game-scraper/1.0 (+https://github.com/Doubfyre/spotify-game)',
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  return await res.json();
}

// Defensive parse — the API could in theory ship a row with a missing field
// or a string where we expect a number. Skip malformed rows rather than
// throwing the whole scrape away.
function parseRows(json) {
  if (!json || !Array.isArray(json.rows)) {
    throw new Error('Unexpected response: missing "rows" array.');
  }
  const out = [];
  for (const row of json.rows) {
    if (!Array.isArray(row) || row.length <= IDX.monthly_listeners) continue;
    const spotify_id =
      typeof row[IDX.spotify_id] === 'string' ? row[IDX.spotify_id] : null;
    const artist_name = String(row[IDX.artist_name] ?? '').trim();
    const image_hash =
      typeof row[IDX.image_hash] === 'string' && row[IDX.image_hash]
        ? row[IDX.image_hash]
        : null;
    const rank = Number(row[IDX.rank]);
    const monthly_listeners = Number(row[IDX.monthly_listeners]);
    if (!artist_name) continue;
    if (!Number.isFinite(rank) || rank < 1) continue;
    if (!Number.isFinite(monthly_listeners)) continue;
    out.push({ rank, artist_name, spotify_id, image_hash, monthly_listeners });
  }
  return out;
}

async function main() {
  loadEnvLocal();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set them in .env.local.',
    );
    process.exit(1);
  }

  // Guard against accidentally using the publishable (anon) key for writes.
  if (serviceKey.startsWith('sb_publishable_')) {
    console.error(
      'SUPABASE_SERVICE_ROLE_KEY is set to a publishable key (sb_publishable_...). ' +
        'Use the secret key (sb_secret_...) from Supabase → Project Settings → API Keys.',
    );
    process.exit(1);
  }
  const keyHint = serviceKey.slice(0, 14) + '…';
  console.log(`Using Supabase key: ${keyHint} (expect sb_secret_…)`);

  // Default to today's London date for manual runs ("fill in today's data").
  // The production cron (app/api/cron/scrape/route.ts) uses tomorrow's London
  // date instead, since it fires before midnight UK in prep for the next day.
  const snapshotDate = process.env.SNAPSHOT_DATE || getTodayLondon();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) {
    console.error(`Invalid SNAPSHOT_DATE "${snapshotDate}" — expected YYYY-MM-DD.`);
    process.exit(1);
  }

  console.log(`Fetching ${SOURCE_URL} ...`);
  const json = await fetchJson(SOURCE_URL);
  if (json.date) console.log(`Source-reported date: ${json.date}`);

  const allRows = parseRows(json);
  console.log(`Parsed ${allRows.length} rows.`);
  if (allRows.length < TOP_N) {
    throw new Error(
      `Expected at least ${TOP_N} rows, got ${allRows.length}. Source format may have changed.`,
    );
  }

  // Sort by rank ascending and take the top N. The source appears sorted
  // already but don't assume it. Also dedupe by rank — the feed has been
  // observed to occasionally ship two rows at the same rank (different
  // artists, same chart position glitch), which would trip the (snapshot_date,
  // rank) conflict target on upsert.
  allRows.sort((a, b) => a.rank - b.rank);
  const byRank = new Map();
  for (const r of allRows) {
    if (!byRank.has(r.rank)) byRank.set(r.rank, r);
    else console.warn(`Warning: duplicate rank ${r.rank} — keeping first ("${byRank.get(r.rank).artist_name}"), dropping "${r.artist_name}"`);
  }
  const top = Array.from(byRank.values()).slice(0, TOP_N);

  const missingIds = top.filter((r) => !r.spotify_id);
  if (missingIds.length > 0) {
    console.warn(
      `Warning: ${missingIds.length} of top ${TOP_N} rows missing spotify_id (ranks: ${missingIds.map((r) => r.rank).join(', ')})`,
    );
  }

  const records = top.map((r) => ({
    snapshot_date: snapshotDate,
    rank: r.rank,
    spotify_id: r.spotify_id,
    artist_name: r.artist_name,
    image_hash: r.image_hash,
    monthly_listeners: r.monthly_listeners,
  }));

  console.log(`Upserting ${records.length} rows for ${snapshotDate} ...`);
  for (let i = 0; i < records.length; i += UPSERT_CHUNK) {
    const chunk = records.slice(i, i + UPSERT_CHUNK);
    await upsertChunk(supabaseUrl, serviceKey, 'artist_snapshots', chunk);
  }

  console.log(`Done. Snapshot ${snapshotDate}: top ${records.length} stored.`);
}

// Posts directly to the PostgREST endpoint with the `apikey` header.
// We avoid @supabase/supabase-js here because it always sets
// `Authorization: Bearer <key>`, which the Supabase gateway rejects as
// an invalid JWT when using the new non-JWT `sb_secret_...` keys — the
// request then runs under a role without INSERT privileges.
async function upsertChunk(supabaseUrl, apiKey, table, rows) {
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: apiKey,
      'Content-Type': 'application/json',
      // merge-duplicates = upsert; return=minimal skips sending the rows back.
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase upsert failed: ${res.status} ${res.statusText} — ${body}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
