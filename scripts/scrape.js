// Scrapes the top 500 artists by Spotify monthly listeners from kworb.net
// and upserts a dated snapshot into Supabase.
//
// Usage:
//   node scripts/scrape.js            # today's date (UTC)
//   SNAPSHOT_DATE=2026-04-22 node scripts/scrape.js
//
// Required env (loaded from .env.local):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

const fs = require('node:fs');
const path = require('node:path');
const cheerio = require('cheerio');

const SOURCE_URL = 'https://kworb.net/spotify/listeners.html';
const TOP_N = 500;
// PostgREST batches larger than a few thousand rows can time out; 500 is well under the limit but we
// chunk anyway to keep payloads small.
const UPSERT_CHUNK = 500;

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

function parseInteger(raw) {
  const n = Number(String(raw).replace(/[,\s]/g, ''));
  if (!Number.isFinite(n)) throw new Error(`Not a number: "${raw}"`);
  return n;
}

function extractSpotifyId(href) {
  // hrefs look like "artist/0du5cEVh5yTK9QJze8zA0C_songs.html"
  const match = href && href.match(/artist\/([A-Za-z0-9]{22})/);
  return match ? match[1] : null;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'spotify-game-scraper/1.0 (+https://github.com/) contact: jack@thelivingcard.co.uk',
    },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  return await res.text();
}

function parseRows(html) {
  const $ = cheerio.load(html);
  const rows = [];
  $('table tbody tr').each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length < 3) return;
    const rank = parseInteger($(cells[0]).text());
    const anchor = $(cells[1]).find('a').first();
    const artistName = anchor.text().trim() || $(cells[1]).text().trim();
    const spotifyId = extractSpotifyId(anchor.attr('href'));
    const monthlyListeners = parseInteger($(cells[2]).text());
    rows.push({ rank, artist_name: artistName, spotify_id: spotifyId, monthly_listeners: monthlyListeners });
  });
  return rows;
}

function todayUtcDate() {
  return new Date().toISOString().slice(0, 10);
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
  // New-format keys: `sb_secret_...` = service_role, `sb_publishable_...` = anon.
  // Legacy keys are JWTs and we can't cheaply tell them apart, so just pass those through.
  if (serviceKey.startsWith('sb_publishable_')) {
    console.error(
      'SUPABASE_SERVICE_ROLE_KEY is set to a publishable key (sb_publishable_...). ' +
        'Use the secret key (sb_secret_...) from Supabase → Project Settings → API Keys.',
    );
    process.exit(1);
  }
  const keyHint = serviceKey.slice(0, 14) + '…';
  console.log(`Using Supabase key: ${keyHint} (expect sb_secret_…)`);

  const snapshotDate = process.env.SNAPSHOT_DATE || todayUtcDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) {
    console.error(`Invalid SNAPSHOT_DATE "${snapshotDate}" — expected YYYY-MM-DD.`);
    process.exit(1);
  }

  console.log(`Fetching ${SOURCE_URL} ...`);
  const html = await fetchHtml(SOURCE_URL);

  const allRows = parseRows(html);
  console.log(`Parsed ${allRows.length} rows.`);
  if (allRows.length < TOP_N) {
    throw new Error(`Expected at least ${TOP_N} rows, got ${allRows.length}. Page structure may have changed.`);
  }

  const top = allRows.slice(0, TOP_N);
  const missingIds = top.filter((r) => !r.spotify_id);
  if (missingIds.length > 0) {
    console.warn(`Warning: ${missingIds.length} of top ${TOP_N} rows missing spotify_id (ranks: ${missingIds.map((r) => r.rank).join(', ')})`);
  }

  const records = top.map((r) => ({
    snapshot_date: snapshotDate,
    rank: r.rank,
    spotify_id: r.spotify_id,
    artist_name: r.artist_name,
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
