// Lightweight analytics helper. Fires silent inserts into the
// `game_events` table from the browser. Never throws and never blocks
// gameplay — the game code calls `trackEvent(...)` fire-and-forget.
//
// Expected schema in Supabase (create once if you haven't already):
//
//   create table public.game_events (
//     id          uuid primary key default gen_random_uuid(),
//     event_type  text not null,
//     session_id  uuid not null,
//     user_id     uuid,
//     created_at  timestamptz not null default now()
//   );
//   create index game_events_type_created_idx
//     on public.game_events (event_type, created_at desc);
//   create index game_events_session_idx on public.game_events (session_id);
//   create index game_events_created_idx on public.game_events (created_at desc);
//   grant select, insert on public.game_events to anon, authenticated;
//   alter table public.game_events enable row level security;
//   create policy "public read"   on public.game_events for select using (true);
//   create policy "public insert" on public.game_events for insert with check (true);

import { createBrowserSupabase } from "./supabase";

const LS_SESSION_KEY = "tg-session-id";

// Stable per-browser identifier that persists across visits. Used to
// count "true unique visitors" on the admin dashboard independently of
// whether the user signs in. Lives in localStorage so incognito/
// cleared-storage visits count as a new session — that's fine.
export function getSessionId(): string {
  try {
    let id = localStorage.getItem(LS_SESSION_KEY);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      id = crypto.randomUUID();
      localStorage.setItem(LS_SESSION_KEY, id);
    }
    return id;
  } catch {
    // localStorage disabled — ephemeral id per call. They'll look like
    // a new session on every event; acceptable fallback.
    return crypto.randomUUID();
  }
}

/**
 * Fire-and-forget insert into `game_events`. Safe to call without
 * `await`. Swallows every error: nothing this function does should
 * ever be visible to the player.
 */
export async function trackEvent(eventType: string): Promise<void> {
  try {
    const sessionId = getSessionId();
    const supa = createBrowserSupabase();
    let userId: string | null = null;
    try {
      const {
        data: { user },
      } = await supa.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      // Auth lookup failed — record the event as anonymous.
    }
    await supa.from("game_events").insert({
      event_type: eventType,
      session_id: sessionId,
      user_id: userId,
    });
  } catch {
    // Silent fail by design.
  }
}
