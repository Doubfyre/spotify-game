import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy · The Spotify Game",
  description: "How The Spotify Game handles your data.",
};

// Placeholders — replace with a real inbox/mailto before public launch.
const CONTACT_EMAIL = "hello@thespotifygame.example";
const LAST_UPDATED = "April 2026";

export default function PrivacyPage() {
  return (
    <main className="flex-1 px-5 sm:px-10 pt-32 pb-16">
      <div className="w-full max-w-3xl mx-auto">
        <Link
          href="/"
          className="font-mono text-[11px] tracking-[2px] uppercase text-muted hover:text-foreground transition"
        >
          ← Back to home
        </Link>

        <div className="mt-8 flex items-center gap-[10px] font-mono text-[11px] tracking-[3px] uppercase text-spotify font-medium">
          <span className="w-6 h-px bg-spotify" />
          Privacy policy
        </div>
        <h1
          className="mt-3 font-display tracking-[2px] leading-none text-foreground"
          style={{ fontSize: "clamp(48px, 9vw, 88px)" }}
        >
          PRIVACY
        </h1>
        <p className="mt-4 font-mono text-[10px] tracking-[2px] uppercase text-muted">
          Last updated {LAST_UPDATED}
        </p>

        <div className="mt-10 space-y-10 text-foreground/90 font-light leading-[1.7]">
          <Section title="What we collect">
            <ul className="list-disc ml-5 space-y-2">
              <li>Your email address, when you create an account.</li>
              <li>
                Daily challenge scores, streaks, and timestamps — stored in
                the <code className="font-mono text-muted">daily_scores</code>{" "}
                and <code className="font-mono text-muted">profiles</code>{" "}
                tables in our database.
              </li>
              <li>
                Game session data stored in your browser&rsquo;s localStorage
                — which daily challenge you&rsquo;ve completed today, your
                best solo-play score, whether you&rsquo;ve dismissed
                notices. None of this leaves your device unless you sign in
                and your score is submitted to the leaderboard.
              </li>
            </ul>
          </Section>

          <Section title="How we use it">
            <ul className="list-disc ml-5 space-y-2">
              <li>Saving your progress between sessions and across devices.</li>
              <li>
                Showing leaderboards for the daily challenge (your
                leaderboard name is visible to other players; your email is
                not).
              </li>
              <li>Calculating your streak and stats on the profile page.</li>
            </ul>
          </Section>

          <Section title="Where your data lives">
            <ul className="list-disc ml-5 space-y-2">
              <li>
                <strong className="text-foreground">Supabase</strong> (EU
                servers) — for the database and authentication.
              </li>
              <li>
                <strong className="text-foreground">Your browser</strong> —
                localStorage, only on the device(s) you play on.
              </li>
            </ul>
          </Section>

          <Section title="Third-party services">
            <ul className="list-disc ml-5 space-y-2">
              <li>
                <strong className="text-foreground">Supabase</strong> —
                database and authentication.
              </li>
              <li>
                <strong className="text-foreground">Vercel</strong> — hosting.
              </li>
              <li>
                <strong className="text-foreground">Spotify ranking data</strong>{" "}
                — fetched daily from a public data source. No user data is
                involved in this process.
              </li>
            </ul>
          </Section>

          <Section title="Your rights">
            <p>
              You can ask us to delete your account and all associated data
              by emailing{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-spotify hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
              . We&rsquo;ll remove your email, all rows in our tables that
              reference you, and confirm when it&rsquo;s done.
            </p>
            <p>
              Under UK GDPR you have the right to access, correct, or erase
              your personal data at any time.
            </p>
          </Section>

          <Section title="Data retention">
            <p>
              We keep your data for as long as your account is active. If
              you delete your account, all associated data is removed within
              30 days.
            </p>
          </Section>

          <Section title="No advertising, no data selling">
            <p>
              We don&rsquo;t run ads, don&rsquo;t sell your data, and
              don&rsquo;t share it with third parties beyond the services
              listed above (each of which needs it to function).
            </p>
          </Section>

          <Section title="Cookies">
            <p>
              We don&rsquo;t set tracking cookies. The only browser storage
              we use is localStorage — for game state on your device — and
              authentication cookies set by Supabase when you sign in, which
              are required to keep you logged in.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Questions, deletion requests, or anything else:{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-spotify hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>
        </div>
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2
        className="font-display tracking-[2px] text-spotify leading-none mb-4"
        style={{ fontSize: "clamp(24px, 4vw, 34px)" }}
      >
        {title}
      </h2>
      <div className="text-[15px] sm:text-[16px] space-y-3">{children}</div>
    </section>
  );
}
