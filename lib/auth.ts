// Server-only auth helpers. Wraps Supabase's `auth.getUser()` in
// React's `cache()` so the same render pass only pays the JWT-
// validation round-trip once, no matter how many components ask.
//
// Without this the layout fetches the user, then so does the page,
// then sometimes a server action — three+ network calls per render
// to the Supabase Auth API just to read the same cookie.

import "server-only";
import { cache } from "react";
import { createServerSupabase } from "./supabase-server";

/**
 * Returns the current user (or null) for this render. Memoised per
 * render via React.cache, so calling it from both the layout and a
 * page within the same request hits Supabase Auth exactly once.
 *
 * Errors from `auth.getUser()` are swallowed and logged — a transient
 * auth failure shouldn't break server rendering, just yield "no user".
 * If you need the raw error, call createServerSupabase directly.
 */
export const getCachedUser = cache(async () => {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    // Surfaced for Vercel logs; not propagated to render.
    console.warn("[auth] getCachedUser error —", error.message);
  }
  return data?.user ?? null;
});
