// Online Play — realtime multiplayer party mode.
//
// Trust model: guest-friendly. user_id / host_id are NOT foreign keys to
// auth.users — they're plain UUIDs that logged-in users fill from their
// auth.uid() and guests fill from a client-generated UUID stored in
// localStorage. The only gate on a room is the 4-char room code, which
// is meant to be shared among friends. RLS is wide-open; see the doc
// comment in OnlineParty.tsx for the deliberate tradeoff.
//
// ---------------------------------------------------------------------
// Fresh-install schema. Run this in the Supabase SQL editor:
//
//   -- Rooms (the "host" is the creator).
//   create table public.party_rooms (
//     code               text primary key check (code ~ '^[A-Z0-9]{4}$'),
//     host_id            uuid not null,
//     snapshot_date      date not null,
//     total_rounds       int  not null default 5 check (total_rounds in (3, 5, 10)),
//     status             text not null default 'lobby'
//                          check (status in ('lobby', 'active', 'finished')),
//     current_round      int  not null default 0,
//     current_player_idx int  not null default 0,
//     turn_started_at    timestamptz,
//     created_at         timestamptz not null default now()
//   );
//
//   -- Players belong to a room.
//   create table public.party_players (
//     id           uuid primary key default gen_random_uuid(),
//     room_code    text not null references public.party_rooms(code) on delete cascade,
//     user_id      uuid not null,
//     display_name text not null,
//     turn_order   int  not null,
//     score        int  not null default 0,
//     joined_at    timestamptz not null default now(),
//     unique (room_code, user_id)
//   );
//   create index party_players_room_turn_idx on public.party_players (room_code, turn_order);
//
//   -- One pick per player per round.
//   create table public.party_picks (
//     id           uuid primary key default gen_random_uuid(),
//     room_code    text not null references public.party_rooms(code) on delete cascade,
//     player_id    uuid not null references public.party_players(id) on delete cascade,
//     round        int  not null,
//     input        text not null,
//     spotify_id   text,
//     artist_name  text,
//     image_hash   text,
//     rank         int,
//     points       int  not null default 0,
//     created_at   timestamptz not null default now(),
//     unique (room_code, player_id, round)
//   );
//   create index party_picks_room_idx on public.party_picks (room_code);
//
//   -- Grants: anon + authenticated can read/write. Trust is the room code.
//   grant select, insert, update, delete on public.party_rooms    to anon, authenticated;
//   grant select, insert, update, delete on public.party_players  to anon, authenticated;
//   grant select, insert                  on public.party_picks    to anon, authenticated;
//
//   alter table public.party_rooms    enable row level security;
//   alter table public.party_players  enable row level security;
//   alter table public.party_picks    enable row level security;
//
//   create policy "public read rooms"    on public.party_rooms    for select using (true);
//   create policy "public insert rooms"  on public.party_rooms    for insert with check (true);
//   create policy "public update rooms"  on public.party_rooms    for update using (true);
//   create policy "public delete rooms"  on public.party_rooms    for delete using (true);
//
//   create policy "public read players"    on public.party_players  for select using (true);
//   create policy "public insert players"  on public.party_players  for insert with check (true);
//   create policy "public update players"  on public.party_players  for update using (true);
//   create policy "public delete players"  on public.party_players  for delete using (true);
//
//   create policy "public read picks"    on public.party_picks    for select using (true);
//   create policy "public insert picks"  on public.party_picks    for insert with check (true);
//
//   -- Realtime: publish changes to the supabase_realtime publication.
//   alter publication supabase_realtime add table public.party_rooms;
//   alter publication supabase_realtime add table public.party_players;
//   alter publication supabase_realtime add table public.party_picks;
//
// ---------------------------------------------------------------------
// Upgrade from the old authenticated-only schema. Run once if your
// project was created before the guest-play switch (symptom: guest
// inserts fail with "new row violates row-level security policy" or
// FK violations on host_id / user_id). Idempotent.
//
//   -- Drop the FKs to auth.users so guests (no auth session) can write.
//   alter table public.party_rooms    drop constraint if exists party_rooms_host_id_fkey;
//   alter table public.party_players  drop constraint if exists party_players_user_id_fkey;
//
//   -- Drop the old role/uid-scoped policies.
//   drop policy if exists "auth read rooms"              on public.party_rooms;
//   drop policy if exists "auth read players"            on public.party_players;
//   drop policy if exists "auth read picks"              on public.party_picks;
//   drop policy if exists "host creates rooms"           on public.party_rooms;
//   drop policy if exists "members update rooms"         on public.party_rooms;
//   drop policy if exists "host deletes rooms"           on public.party_rooms;
//   drop policy if exists "players join"                 on public.party_players;
//   drop policy if exists "players update self"          on public.party_players;
//   drop policy if exists "players leave or host removes" on public.party_players;
//   drop policy if exists "players post picks"           on public.party_picks;
//
//   -- Grants, now wide-open.
//   grant select, insert, update, delete on public.party_rooms    to anon, authenticated;
//   grant select, insert, update, delete on public.party_players  to anon, authenticated;
//   grant select, insert                  on public.party_picks    to anon, authenticated;
//
//   -- Recreate the wide-open policies (mirror the fresh-install block).
//   create policy "public read rooms"    on public.party_rooms    for select using (true);
//   create policy "public insert rooms"  on public.party_rooms    for insert with check (true);
//   create policy "public update rooms"  on public.party_rooms    for update using (true);
//   create policy "public delete rooms"  on public.party_rooms    for delete using (true);
//   create policy "public read players"    on public.party_players  for select using (true);
//   create policy "public insert players"  on public.party_players  for insert with check (true);
//   create policy "public update players"  on public.party_players  for update using (true);
//   create policy "public delete players"  on public.party_players  for delete using (true);
//   create policy "public read picks"    on public.party_picks    for select using (true);
//   create policy "public insert picks"  on public.party_picks    for insert with check (true);
//
// ---------------------------------------------------------------------
// Legacy: if you previously enabled Supabase Anonymous Sign-In and have
// `auth.users` rows with `is_anonymous = true`, clean them up once by
// hand (they no longer serve any purpose). Then disable Anonymous
// Sign-In under Authentication → Providers → Anonymous.
//
//   delete from auth.users where is_anonymous = true;

import { createServerSupabase } from "@/lib/supabase-server";
import { supabase as dbReadOnly } from "@/lib/supabase";
import { getTodayLondon } from "@/lib/dates";
import OnlinePartyEntry from "./OnlinePartyEntry";
import type { ArtistRow } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function OnlinePartyPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Today's top 500, fetched server-side so the client has data ready when a
  // room starts. Artist list is the same for every player; no need to gate.
  const snapshotDate = getTodayLondon();
  const { data: artists } = await dbReadOnly
    .from("artist_snapshots")
    .select("rank, artist_name, spotify_id, image_hash")
    .eq("snapshot_date", snapshotDate)
    .lte("rank", 500)
    .order("rank", { ascending: true });

  // Derive the display name for signed-in users from their email.
  // Guests have no session; the client prompts for a name and generates
  // a local UUID. We ignore any legacy anonymous sessions that might
  // still exist in cookies — is_anonymous users are treated as guests
  // so the stale anon user_id doesn't leak into new rooms.
  const isRealUser = Boolean(user && !user.is_anonymous);
  const emailDisplayName =
    isRealUser && user!.email ? (user!.email.split("@")[0] ?? null) : null;

  return (
    <OnlinePartyEntry
      initialUserId={isRealUser ? (user?.id ?? null) : null}
      emailDisplayName={emailDisplayName}
      snapshotDate={snapshotDate}
      artists={(artists ?? []) as ArtistRow[]}
    />
  );
}
