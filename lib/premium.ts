// Premium-tier infrastructure. Nothing is gated yet — `isPremium` returns
// false for every existing user because no one has `is_premium = true` in
// the profiles table. This file exists so premium checks have a single
// canonical call site as we add paid features.
//
// ---------------------------------------------------------------------
// RLS diagnostic + fix (run this block in the Supabase SQL editor if
// solo_best_score / higher_lower_best_streak are staying NULL after a
// game). The update policy as originally written relied on the implicit
// USING-as-WITH-CHECK fallback, which is brittle; the fix below makes
// both clauses explicit, scopes the policy to authenticated, and re-
// grants UPDATE at the table level so no column-level grant is missing.
//
//   -- 1) Inspect existing policies + grants
//   SELECT polname, polcmd,
//          pg_get_expr(polqual, polrelid)      AS using_clause,
//          pg_get_expr(polwithcheck, polrelid) AS check_clause
//   FROM pg_policy
//   WHERE polrelid = 'public.profiles'::regclass;
//
//   SELECT grantee, privilege_type
//   FROM information_schema.table_privileges
//   WHERE table_schema = 'public' AND table_name = 'profiles';
//
//   -- 2) Replace the UPDATE policy with an explicit USING + WITH CHECK,
//   --    scoped to authenticated users only.
//   DROP POLICY IF EXISTS "users update own profile" ON public.profiles;
//   CREATE POLICY "users update own profile"
//     ON public.profiles FOR UPDATE
//     TO authenticated
//     USING (auth.uid() = id)
//     WITH CHECK (auth.uid() = id);
//
//   -- 3) Make sure the table-level UPDATE grant exists for authenticated.
//   --    (Column-level grants would silently block new columns; this is
//   --    the belt-and-braces fix.)
//   GRANT UPDATE ON public.profiles TO authenticated;
//
//   -- 4) Sanity check: should return one row per authenticated signed-in
//   --    user matching the policy.
//   SELECT id, solo_best_score, higher_lower_best_streak
//   FROM public.profiles
//   WHERE id = auth.uid();
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
//     TO authenticated
//     USING (auth.uid() = id);
//   -- UPDATE policy needs BOTH clauses: USING filters which rows the user
//   -- can touch, WITH CHECK validates the row's post-update state. Leaving
//   -- WITH CHECK implicit has caused silent update failures in the past.
//   CREATE POLICY "users update own profile"
//     ON public.profiles FOR UPDATE
//     TO authenticated
//     USING (auth.uid() = id)
//     WITH CHECK (auth.uid() = id);
//   GRANT UPDATE ON public.profiles TO authenticated;
//
//   -- Lets a signed-in user create their own profile row. Needed for the
//   -- upsert-before-update pattern used when saving best scores / streaks,
//   -- which is what keeps the save path self-healing for users whose row
//   -- was never created by the handle_new_user trigger (i.e. anyone who
//   -- signed up before that trigger existed).
//   CREATE POLICY "users insert own profile"
//     ON public.profiles FOR INSERT
//     WITH CHECK (auth.uid() = id);
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
//   -- One-time backfill for users who signed up before the trigger
//   -- existed. Creates a profile row for every auth user that doesn't
//   -- already have one; ON CONFLICT DO NOTHING makes it re-runnable.
//   INSERT INTO public.profiles (id)
//   SELECT id FROM auth.users
//   ON CONFLICT (id) DO NOTHING;
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
