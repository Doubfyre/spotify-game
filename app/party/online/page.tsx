// Online Play — realtime multiplayer party mode.
//
// Required Supabase tables. Run this in the SQL editor:
//
//   -- Rooms (the "host" is the creator).
//   create table public.party_rooms (
//     code               text primary key check (code ~ '^[A-Z0-9]{4}$'),
//     host_id            uuid not null references auth.users(id) on delete cascade,
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
//     user_id      uuid not null references auth.users(id) on delete cascade,
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
//   -- If the party_picks table already exists from an earlier deploy, add
//   -- the image column separately:
//   alter table public.party_picks add column if not exists image_hash text;
//
//   -- Grants (service_role has all by default)
//   grant select, insert, update, delete on public.party_rooms    to authenticated;
//   grant select, insert, update, delete on public.party_players  to authenticated;
//   grant select, insert                  on public.party_picks    to authenticated;
//
//   -- RLS. Permissive within the authenticated role — see the doc comment
//   -- in OnlineParty.tsx for the intentional tradeoff (friends-only
//   -- trust model, relies on 4-char room code secrecy).
//   alter table public.party_rooms    enable row level security;
//   alter table public.party_players  enable row level security;
//   alter table public.party_picks    enable row level security;
//
//   create policy "auth read rooms"    on public.party_rooms    for select to authenticated using (true);
//   create policy "auth read players"  on public.party_players  for select to authenticated using (true);
//   create policy "auth read picks"    on public.party_picks    for select to authenticated using (true);
//
//   create policy "host creates rooms" on public.party_rooms for insert to authenticated
//     with check (host_id = auth.uid());
//   create policy "members update rooms" on public.party_rooms for update to authenticated using (
//     host_id = auth.uid()
//     or exists (
//       select 1 from public.party_players pp
//       where pp.room_code = party_rooms.code and pp.user_id = auth.uid()
//     )
//   );
//   create policy "host deletes rooms" on public.party_rooms for delete to authenticated
//     using (host_id = auth.uid());
//
//   create policy "players join"       on public.party_players for insert to authenticated
//     with check (user_id = auth.uid());
//   create policy "players update self" on public.party_players for update to authenticated
//     using (user_id = auth.uid());
//   create policy "players leave or host removes" on public.party_players for delete to authenticated
//     using (
//       user_id = auth.uid()
//       or exists (
//         select 1 from public.party_rooms pr
//         where pr.code = party_players.room_code and pr.host_id = auth.uid()
//       )
//     );
//
//   create policy "players post picks" on public.party_picks for insert to authenticated
//     with check (
//       exists (
//         select 1 from public.party_players pp
//         where pp.id = party_picks.player_id and pp.user_id = auth.uid()
//       )
//     );
//
//   -- Realtime: publish changes to the supabase_realtime publication.
//   alter publication supabase_realtime add table public.party_rooms;
//   alter publication supabase_realtime add table public.party_players;
//   alter publication supabase_realtime add table public.party_picks;
//
// ---------------------------------------------------------------------
// Guest play: this page no longer redirects signed-out users to /signin.
// Instead, unauthenticated visitors pick a display name and we mint a
// Supabase anonymous session for them (via supabase.auth.signInAnonymously
// on the client). Anonymous users are in the `authenticated` role, so all
// the RLS policies above still apply unchanged and auth.uid() resolves
// to their anon user id.
//
// REQUIRED: enable Anonymous Sign-In in the Supabase dashboard under
// Authentication → Providers → Anonymous. Without it, signInAnonymously
// returns an error and the client shows a fallback prompting full sign-in.

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

  // Only derive an email-based display name for genuinely signed-in users.
  // Anonymous users have no email and get their name from localStorage /
  // the name-entry form on the client instead.
  const emailDisplayName =
    user && !user.is_anonymous && user.email
      ? (user.email.split("@")[0] ?? null)
      : null;

  return (
    <OnlinePartyEntry
      initialUserId={user?.id ?? null}
      initialIsAnonymous={user?.is_anonymous ?? false}
      emailDisplayName={emailDisplayName}
      snapshotDate={snapshotDate}
      artists={(artists ?? []) as ArtistRow[]}
    />
  );
}
