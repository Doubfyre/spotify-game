/**
 * OAuth callback — Supabase redirects the browser here after Google / Apple
 * signs the user in. We exchange the ?code= for a session, which sets the
 * session cookies on the response, then redirect to ?next= (or / by default).
 *
 * The CookieOptions "setAll" in createServerSupabase works here because this
 * is a Route Handler, not a Server Component render.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/";
  // Only allow same-origin redirects — don't let an attacker pass ?next=https://evil.com.
  const next = nextParam.startsWith("/") ? nextParam : "/";

  if (code) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${url.origin}${next}`);
    }
    console.warn("auth callback: exchangeCodeForSession failed —", error.message);
  }

  return NextResponse.redirect(`${url.origin}/signin?error=oauth_failed`);
}
