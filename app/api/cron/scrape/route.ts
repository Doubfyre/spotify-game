/**
 * Vercel Cron endpoint — invoked daily at 06:00 UTC (see vercel.json).
 *
 * Authentication: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 * Anything else gets a 401. If CRON_SECRET isn't set on the server we fail
 * closed with 500 rather than leave the endpoint publicly scrapeable.
 *
 * Behavior mirrors `scripts/scrape.js` — fetches kworb.net/spotify/listeners,
 * parses the table, upserts today's (UTC) top 500 into `artist_snapshots`.
 * Idempotent on (snapshot_date, rank) via PostgREST merge-duplicates.
 *
 * Note: the parsing logic is duplicated with scripts/scrape.js. Sharing it
 * would require adding a TS runtime for the CLI script (tsx/ts-node) — not
 * worth a new dep. If kworb's table structure ever changes, update both.
 */

import * as cheerio from "cheerio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SOURCE_URL = "https://kworb.net/spotify/listeners.html";
const TOP_N = 500;
const UPSERT_CHUNK = 500;

type Row = {
  rank: number;
  artist_name: string;
  spotify_id: string | null;
  monthly_listeners: number;
};

function parseInteger(raw: string): number {
  const n = Number(String(raw).replace(/[,\s]/g, ""));
  if (!Number.isFinite(n)) throw new Error(`Not a number: "${raw}"`);
  return n;
}

function extractSpotifyId(href: string | undefined): string | null {
  const match = href && href.match(/artist\/([A-Za-z0-9]{22})/);
  return match ? match[1] : null;
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchHtml(url: string): Promise<string> {
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
  return await res.text();
}

function parseRows(html: string): Row[] {
  const $ = cheerio.load(html);
  const rows: Row[] = [];
  $("table tbody tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 3) return;
    const rank = parseInteger($(cells[0]).text());
    const anchor = $(cells[1]).find("a").first();
    const artist_name = anchor.text().trim() || $(cells[1]).text().trim();
    const spotify_id = extractSpotifyId(anchor.attr("href"));
    const monthly_listeners = parseInteger($(cells[2]).text());
    rows.push({ rank, artist_name, spotify_id, monthly_listeners });
  });
  return rows;
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
    const snapshotDate = todayUtcDate();
    const html = await fetchHtml(SOURCE_URL);
    const allRows = parseRows(html);

    if (allRows.length < TOP_N) {
      return Response.json(
        {
          error: `Parsed ${allRows.length} rows, expected at least ${TOP_N}. Source HTML may have changed.`,
        },
        { status: 502 },
      );
    }

    const top = allRows.slice(0, TOP_N);
    const records = top.map((r) => ({
      snapshot_date: snapshotDate,
      rank: r.rank,
      spotify_id: r.spotify_id,
      artist_name: r.artist_name,
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
      inserted: records.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("cron scrape failed:", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
