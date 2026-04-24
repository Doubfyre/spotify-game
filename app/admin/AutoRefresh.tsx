"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Invisible client component. Calls `router.refresh()` on an interval so
// the server-rendered admin dashboard re-fetches its data without a full
// reload. Safe to mount once per admin page; cleans up its timer on
// unmount so it doesn't leak across navigations.
export default function AutoRefresh({
  intervalMs = 30_000,
}: {
  intervalMs?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
