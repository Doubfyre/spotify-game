// Browser-safe Supabase helpers. DO NOT import next/headers or any server-
// only APIs in this file — it gets pulled into client bundles via the
// `createBrowserSupabase` factory and `supabase` singleton below. Server-
// only helpers live in lib/supabase-server.ts.

import { createClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Add them to .env.local.",
  );
}

/**
 * Legacy singleton client for non-auth SELECTs. Used by server components that
 * just need to read public data (solo/page.tsx, daily/page.tsx). Doesn't know
 * about user sessions — don't use for anything auth-sensitive.
 */
export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Call from Client Components to get an auth-aware Supabase client. Session
 * lives in cookies shared with the server, so layouts see the user too.
 */
export function createBrowserSupabase() {
  return createBrowserClient(supabaseUrl!, supabaseKey!);
}

export type ArtistRow = {
  rank: number;
  artist_name: string;
  spotify_id: string | null;
};

