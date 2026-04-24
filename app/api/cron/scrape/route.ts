/**
 * Vercel Cron endpoint — invoked daily at 22:00 UTC (see vercel.json).
 *
 * Authentication: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 * Anything else gets a 401. If CRON_SECRET isn't set on the server we fail
 * closed with 500 rather than leave the endpoint publicly scrapeable.
 *
 * Behavior mirrors `scripts/scrape.js` — fetches music.eduardlupu.com's
 * top-500 JSON feed, parses it, upserts tomorrow's (London) top 500 into
 * `artist_snapshots`. Idempotent on (snapshot_date, rank) via PostgREST
 * merge-duplicates. Label uses *tomorrow's* London date because the cron
 * fires 1–2 hours before London midnight, and this snapshot is the one the
 * app will read for the next London day.
 *
 * Note: the parsing logic is duplicated with scripts/scrape.js. Sharing it
 * would require adding a TS runtime for the CLI script (tsx/ts-node) — not
 * worth a new dep. If the source schema changes, update both.
 *
 * One-time DB migration (run in Supabase SQL editor):
 *   ALTER TABLE public.artist_snapshots ADD COLUMN IF NOT EXISTS image_hash text;
 */

import { getTomorrowLondon } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SOURCE_URL = "https://music.eduardlupu.com/data/latest/top500.json";
const TOP_N = 500;
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

type Row = {
  rank: number;
  artist_name: string;
  spotify_id: string | null;
  image_hash: string | null;
  monthly_listeners: number;
};

type SourceJson = {
  v?: number;
  date?: string;
  fields?: string[];
  rows?: unknown[];
};

async function fetchJson(url: string): Promise<SourceJson> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "spotify-game-scraper/1.0 (+https://github.com/Doubfyre/spotify-game)",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Source fetch failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as SourceJson;
}

// Defensive parse — skip malformed rows rather than throwing the whole
// scrape away on one bad entry.
function parseRows(json: SourceJson): Row[] {
  if (!json || !Array.isArray(json.rows)) {
    throw new Error('Unexpected response: missing "rows" array.');
  }
  const out: Row[] = [];
  for (const r of json.rows) {
    if (!Array.isArray(r) || r.length <= IDX.monthly_listeners) continue;
    const row = r as unknown[];
    const spotify_id =
      typeof row[IDX.spotify_id] === "string"
        ? (row[IDX.spotify_id] as string)
        : null;
    const artist_name = String(row[IDX.artist_name] ?? "").trim();
    const image_hash =
      typeof row[IDX.image_hash] === "string" && row[IDX.image_hash]
        ? (row[IDX.image_hash] as string)
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

async function upsertChunk(
  supabaseUrl: string,
  apiKey: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/artist_snapshots`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: apiKey,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Supabase upsert failed: ${res.status} ${res.statusText} — ${body}`,
    );
  }
}

export async function GET(request: Request) {
  // Server misconfig: no secret set. Fail closed.
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return Response.json(
      { error: "CRON_SECRET is not configured on the server." },
      { status: 500 },
    );
  }
  // Auth: Vercel Cron sends "Authorization: Bearer <secret>".
  const authz = request.headers.get("authorization") ?? "";
  if (authz !== `Bearer ${expected}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return Response.json(
      {
        error:
          "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 500 },
    );
  }

  try {
    const snapshotDate = getTomorrowLondon();
    const json = await fetchJson(SOURCE_URL);
    const allRows = parseRows(json);

    if (allRows.length < TOP_N) {
      return Response.json(
        {
          error: `Parsed ${allRows.length} rows, expected at least ${TOP_N}. Source schema may have changed.`,
          sourceDate: json.date,
        },
        { status: 502 },
      );
    }

    // Sort ascending and take the top N. Source appears sorted already, but
    // don't rely on that. Also dedupe by rank — the feed occasionally ships
    // two rows at the same rank (different artists, chart position glitch),
    // which would trip the (snapshot_date, rank) conflict target on upsert.
    allRows.sort((a, b) => a.rank - b.rank);
    const byRank = new Map<number, Row>();
    for (const r of allRows) {
      if (!byRank.has(r.rank)) byRank.set(r.rank, r);
    }
    const top = Array.from(byRank.values()).slice(0, TOP_N);

    const records = top.map((r) => ({
      snapshot_date: snapshotDate,
      rank: r.rank,
      spotify_id: r.spotify_id,
      artist_name: r.artist_name,
      image_hash: r.image_hash,
      monthly_listeners: r.monthly_listeners,
    }));

    for (let i = 0; i < records.length; i += UPSERT_CHUNK) {
      await upsertChunk(
        supabaseUrl,
        serviceKey,
        records.slice(i, i + UPSERT_CHUNK),
      );
    }

    return Response.json({
      ok: true,
      snapshotDate,
      sourceDate: json.date,
      inserted: records.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("cron scrape failed:", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
