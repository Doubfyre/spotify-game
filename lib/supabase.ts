import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Add them to .env.local.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export type ArtistRow = {
  rank: number;
  artist_name: string;
  spotify_id: string | null;
};

export function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}
