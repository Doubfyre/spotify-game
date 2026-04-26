// Full-page error block used by the per-mode entry pages when the
// snapshot is missing or a server query fails. Server-renderable —
// no "use client" needed.

import Link from "next/link";

export default function PageError({
  title,
  detail,
  backHref = "/",
  backLabel = "Back to home",
}: {
  title: string;
  detail: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <main className="flex-1 flex items-center justify-center px-5 sm:px-10 pt-32 pb-16">
      <div className="w-full max-w-lg bg-surface border border-border rounded-lg p-10 text-center">
        <div className="font-mono text-[11px] tracking-[3px] uppercase text-muted mb-4">
          Error
        </div>
        <h1
          className="font-display leading-none tracking-[2px] text-foreground"
          style={{ fontSize: "clamp(40px, 6vw, 64px)" }}
        >
          {title}
        </h1>
        <p className="text-muted mt-4 mb-8">{detail}</p>
        <Link
          href={backHref}
          className="inline-block border border-border text-foreground rounded-[4px] px-6 py-3 text-sm hover:border-foreground transition"
        >
          {backLabel}
        </Link>
      </div>
    </main>
  );
}
