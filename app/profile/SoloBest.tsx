"use client";

import { useEffect, useState } from "react";

// Mirrors the homepage Solo card: reads localStorage *after* mount so SSR
// renders the em-dash placeholder and the client flips to the stored score
// without a hydration mismatch.
export default function SoloBest() {
  const [best, setBest] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("solo-best-score");
      if (raw !== null) {
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 0) setBest(n);
      }
    } catch {
      // localStorage disabled — leave as null
    }
  }, []);

  return (
    <div className="bg-surface border border-border rounded-lg p-6 flex flex-col">
      <div className="font-mono text-[11px] tracking-[3px] uppercase text-muted mb-3">
        Solo best
      </div>
      <div
        className="font-display leading-none text-spotify tabular-nums"
        style={{ fontSize: "clamp(56px, 9vw, 88px)" }}
      >
        {best !== null ? best.toLocaleString() : "—"}
      </div>
      <div className="mt-auto pt-3 font-mono text-[10px] tracking-[2px] uppercase text-muted">
        Highest solo score
      </div>
    </div>
  );
}
