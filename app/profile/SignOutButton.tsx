"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import { clearGameLocalStorage } from "@/lib/clear-game-state";

export default function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    // Wipe per-player localStorage so a different user on this device
    // doesn't inherit the previous player's progress.
    clearGameLocalStorage();
    // Send them home and force the server layout to re-read the cookie jar
    // (which is now empty) so the nav flips back to Log In / Sign Up.
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={loading}
      className="border border-border text-muted hover:text-red hover:border-red rounded-[4px] px-4 py-2 font-mono text-[11px] tracking-[2px] uppercase transition disabled:opacity-50 shrink-0"
    >
      {loading ? "Signing out…" : "Sign out"}
    </button>
  );
}
