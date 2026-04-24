// Premium-tier infrastructure. Nothing is gated yet — `isPremium` returns
// false for every existing user because no one has `is_premium = true` in
// the profiles table. This file exists so premium checks have a single
// canonical call site as we add paid features.
//
// ---------------------------------------------------------------------
// Required Supabase migration. Run this in the SQL editor:
//
//   -- auth.users is managed by Supabase and can't be altered directly,
//   -- so we store per-user app metadata in a public.profiles table with
//   -- a 1:1 link to auth.users(id).
//   CREATE TABLE public.profiles (
//     id                         uuid primary key references auth.users(id) on delete cascade,
//     is_premium                 boolean not null default false,
//     premium_since              timestamptz,
//     solo_best_score            int,
//     higher_lower_best_streak   int,
//     created_at                 timestamptz not null default now()
//   );
//
//   -- If profiles already exists from an earlier migration, add the columns:
//   ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS solo_best_score int;
//   ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS higher_lower_best_streak int;
//
//   ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "users read own profile"
//     ON public.profiles FOR SELECT
//     USING (auth.uid() = id);
//   CREATE POLICY "users update own profile"
//     ON public.profiles FOR UPDATE
//     USING (auth.uid() = id);
//
//   -- Auto-create a profile row whenever a user signs up. Runs as
//   -- SECURITY DEFINER because the auth.users insert is happening under
//   -- the supabase_auth role, which doesn't have write access to public.
//   CREATE OR REPLACE FUNCTION public.handle_new_user()
//   RETURNS trigger AS $$
//   BEGIN
//     INSERT INTO public.profiles (id) VALUES (new.id);
//     RETURN new;
//   END;
//   $$ LANGUAGE plpgsql SECURITY DEFINER;
//
//   CREATE OR REPLACE TRIGGER on_auth_user_created
//     AFTER INSERT ON auth.users
//     FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
//
// ---------------------------------------------------------------------
// Features that will eventually be gated behind isPremium:
//
//   - Online party mode (currently free; may move to premium at launch)
//   - Full game history beyond the 10 most recent entries on /profile
//   - Extended leaderboard views (all-time, weekly, monthly)
//   - Streak freeze — one per month, preserves a daily streak if the user
//     misses a day
//
// Do not gate any of these yet. This file is infrastructure only.

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns true if the user has an active premium subscription, false
 * otherwise. Falls back to false on any error (missing profile row, RLS
 * denial, network failure) — premium should fail closed, never default to
 * granting paid features.
 *
 * Works with any Supabase client that has at least read access to
 * `public.profiles` for this user. The default RLS policy permits the user
 * to read their own row, so pass either a browser client with an
 * authenticated session or a server client with the user's cookies.
 */
export async function isPremium(
  client: SupabaseClient,
  userId: string,
): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await client
    .from("profiles")
    .select("is_premium")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return false;
  return Boolean((data as { is_premium?: boolean }).is_premium);
}
