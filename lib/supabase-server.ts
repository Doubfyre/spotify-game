// Server-only Supabase helpers. Imports next/headers, which is fine in
// Server Components and Route Handlers but would break client bundles.
// Never import this file from a Client Component.

import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Add them to .env.local.",
  );
}

/**
 * Auth-aware Supabase client backed by Next.js cookies. Use in Server
 * Components (read-only auth lookups via getUser) or Route Handlers
 * (exchanging OAuth codes for a session, signing out, etc).
 *
 * The `setAll` adapter throws when called during a Server Component render
 * (Next.js forbids setting cookies outside Route Handlers / Server Actions).
 * We swallow that — the client-side SDK auto-refreshes tokens, so a missed
 * server-side write is tolerable. In Route Handlers the writes succeed.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl!, supabaseKey!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(
            ({
              name,
              value,
              options,
            }: {
              name: string;
              value: string;
              options: CookieOptions;
            }) => {
              cookieStore.set(name, value, options);
            },
          );
        } catch {
          // Server Component render — see doc comment above.
        }
      },
    },
  });
}
