// Admin dashboard. Gated to ADMIN_EMAIL — unauthenticated users redirect
// to /signin?next=/admin, signed-in non-admins redirect to /. All data is
// fetched server-side on render.

import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase-server";
import { getTodayLondon, addDays, londonDayStartUTC } from "@/lib/dates";
import { isAdminEmail } from "@/lib/admin";
import AutoRefresh from "./AutoRefresh";

export const dynamic = "force-dynamic";

type ScoreRow = {
  user_id: string | null;
  player_name: string | null;
};

type TopRow = {
  player_name: string | null;
  score: number;
};

type AuthUser = {
  id: string;
  email?: string | null;
  created_at: string;
};

// List all users via the Admin API. supabase-js's admin.listUsers works
// with sb_secret_ keys against the auth service (unlike PostgREST), but we
// use raw fetch here for consistency with the scraper and to keep this page
// free of client-side Supabase wiring. Pages until we see a short page or
// hit the safety cap (10 × 1000 = 10k users).
async function listAllUsers(): Promise<AuthUser[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Admin needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  const all: AuthUser[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(
      `${url.replace(/\/$/, "")}/auth/v1/admin/users?per_page=1000&page=${page}`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
        cache: "no-store",
      },
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`listUsers page ${page}: ${res.status} ${body}`);
    }
    const data = (await res.json()) as { users?: AuthUser[] };
    const users = data.users ?? [];
    all.push(...users);
    if (users.length < 1000) break;
  }
  return all;
}

function countUnique(rows: ScoreRow[]): number {
  const set = new Set<string>();
  for (const r of rows) {
    const key = r.user_id ?? r.player_name;
    if (key) set.add(String(key));
  }
  return set.size;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
  return `${date} ${time}`;
}

export default async function AdminPage() {
  // Auth gate: anonymous → signin, wrong user → home.
  const supa = await createServerSupabase();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) redirect("/signin?next=/admin");
  if (!isAdminEmail(user.email)) redirect("/");

  const today = getTodayLondon();
  const weekAgoDate = addDays(today, -7);
  const monthAgoDate = addDays(today, -30);
  const weekAgoTs = new Date(Date.now() - 7 * 86400000);
  const monthAgoTs = new Date(Date.now() - 30 * 86400000);
  const todayStartISO = londonDayStartUTC(today);

  // Helper for count-only queries. Runs head: true so PostgREST doesn't
  // ship the row bodies — only the Content-Range count header. Returns
  // 0 on error so one missing table doesn't break the whole dashboard.
  const countToday = (
    table: string,
    eventType?: string,
  ): Promise<number> =>
    (async () => {
      let q = supa.from(table).select("*", { count: "exact", head: true });
      if (eventType) q = q.eq("event_type", eventType);
      q = q.gte("created_at", todayStartISO);
      const { count, error } = await q;
      if (error) {
        console.error(`admin: count ${table}${eventType ? ` (${eventType})` : ""} —`, error);
        return 0;
      }
      return count ?? 0;
    })();

  // Parallel load. daily_scores reads go through the anon-role PostgREST
  // client (public read policy covers them); auth.users needs service role
  // via the admin endpoint. A failure in listAllUsers falls back to an
  // empty user list so the rest of the dashboard still renders.
  const [
    todayQ,
    weekQ,
    monthQ,
    allQ,
    topQ,
    allUsers,
    soloPlaysToday,
    holPlaysToday,
    dailyStarts,
    dailyCompletes,
    soloStarts,
    soloCompletes,
    holStarts,
    holCompletes,
    sessionIdsToday,
  ] = await Promise.all([
    supa
      .from("daily_scores")
      .select("user_id, player_name")
      .eq("snapshot_date", today),
    supa
      .from("daily_scores")
      .select("user_id, player_name")
      .gte("snapshot_date", weekAgoDate)
      .lte("snapshot_date", today),
    supa
      .from("daily_scores")
      .select("user_id, player_name")
      .gte("snapshot_date", monthAgoDate)
      .lte("snapshot_date", today),
    supa.from("daily_scores").select("user_id, player_name"),
    supa
      .from("daily_scores")
      .select("player_name, score")
      .eq("snapshot_date", today)
      .order("score", { ascending: true })
      .limit(10),
    listAllUsers().catch((err) => {
      console.error("admin: listAllUsers failed —", err);
      return [] as AuthUser[];
    }),
    countToday("solo_scores"),
    countToday("higher_lower_scores"),
    countToday("game_events", "daily_start"),
    countToday("game_events", "daily_complete"),
    countToday("game_events", "solo_start"),
    countToday("game_events", "solo_complete"),
    countToday("game_events", "hol_start"),
    countToday("game_events", "hol_complete"),
    // PostgREST doesn't expose COUNT(DISTINCT …); fetch today's session_id
    // column and dedupe server-side. For very high traffic this would
    // warrant an RPC, but at our scale the bytes are fine.
    supa
      .from("game_events")
      .select("session_id")
      .gte("created_at", todayStartISO),
  ]);

  const todayRows = (todayQ.data ?? []) as ScoreRow[];
  const weekRows = (weekQ.data ?? []) as ScoreRow[];
  const monthRows = (monthQ.data ?? []) as ScoreRow[];
  const allRows = (allQ.data ?? []) as ScoreRow[];
  const topToday = (topQ.data ?? []) as TopRow[];

  const uniqueSessionsToday = (() => {
    const rows = (sessionIdsToday.data ?? []) as Array<{
      session_id: string | null;
    }>;
    const s = new Set<string>();
    for (const r of rows) if (r.session_id) s.add(r.session_id);
    return s.size;
  })();

  const dauSessions = todayRows.length;

  const wauUnique = countUnique(weekRows);
  const wauSessions = weekRows.length;
  const wauSignups = allUsers.filter(
    (u) => new Date(u.created_at) > weekAgoTs,
  ).length;

  const mauUnique = countUnique(monthRows);
  const mauSessions = monthRows.length;
  const mauSignups = allUsers.filter(
    (u) => new Date(u.created_at) > monthAgoTs,
  ).length;

  const totalUsers = allUsers.length;
  const totalCompletions = allRows.length;
  const totalUniquePlayers = countUnique(allRows);

  const recentSignups = [...allUsers]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 10);

  const dataIssue = [todayQ, weekQ, monthQ, allQ, topQ].find((q) => q.error);
  const renderedAt = new Date().toISOString();

  return (
    <main className="flex-1 px-5 sm:px-10 pt-32 pb-16">
      <AutoRefresh />
      <div className="w-full max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="font-mono text-[11px] tracking-[3px] uppercase text-spotify flex items-center gap-[10px] mb-3">
              <span className="w-6 h-px bg-spotify" />
              Admin dashboard
            </div>
            <h1
              className="font-display tracking-[2px] leading-none text-foreground"
              style={{ fontSize: "clamp(48px, 9vw, 88px)" }}
            >
              ADMIN
            </h1>
          </div>
          <div className="text-right">
            <div className="font-mono text-[10px] tracking-[2px] uppercase text-muted">
              Signed in as
            </div>
            <div className="font-mono text-[11px] text-foreground break-all">
              {user.email}
            </div>
            <div className="font-mono text-[10px] tracking-[2px] uppercase text-muted mt-2">
              {formatDateTime(renderedAt)}
            </div>
          </div>
        </div>

        {dataIssue && (
          <div className="mt-8 bg-surface border border-border rounded-lg p-5 font-mono text-[11px] tracking-[1px] uppercase text-red">
            One or more queries failed: {dataIssue.error?.message}
          </div>
        )}

        {/* Daily active */}
        <SectionHeading>Daily active ({today})</SectionHeading>

        {/* Hero metric — closest thing to "how many real people opened
            the app today" because it keys on session_id, which every
            browser has whether they sign in or play or not. */}
        <HeroStatCard
          label="Unique visitors today"
          value={uniqueSessionsToday}
          hint="Distinct session_ids in game_events — counts guests too"
        />

        <div className="mt-3 sm:mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <StatCard
            label="Daily Challenge submissions today"
            value={dauSessions}
            hint="Rows in daily_scores — players who submitted a named score"
          />
          <StatCard label="Solo plays today" value={soloPlaysToday} />
          <StatCard
            label="Higher or Lower plays today"
            value={holPlaysToday}
          />
        </div>

        {/* Today's plays by mode — from game_events. Start/complete pairs
            show drop-off per mode for all players, including guests who
            never submitted a name. */}
        <SectionHeading>Today&rsquo;s plays by mode</SectionHeading>
        <p className="-mt-2 mb-5 font-mono text-[10px] tracking-[1px] uppercase text-muted leading-[1.5] max-w-3xl">
          Starts and completes are tracked via game events (all players
          including guests). Submissions counts only players who
          submitted a named score to the leaderboard.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <ModeCard
            label="Daily Challenge"
            starts={dailyStarts}
            completes={dailyCompletes}
          />
          <ModeCard
            label="Solo"
            starts={soloStarts}
            completes={soloCompletes}
          />
          <ModeCard
            label="Higher or Lower"
            starts={holStarts}
            completes={holCompletes}
          />
        </div>

        {/* Weekly */}
        <SectionHeading>Weekly ({weekAgoDate} → {today})</SectionHeading>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <StatCard label="Unique players" value={wauUnique} />
          <StatCard label="Completions" value={wauSessions} />
          <StatCard label="New signups" value={wauSignups} />
        </div>

        {/* Monthly */}
        <SectionHeading>Monthly ({monthAgoDate} → {today})</SectionHeading>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <StatCard label="Unique players" value={mauUnique} />
          <StatCard label="Completions" value={mauSessions} />
          <StatCard label="New signups" value={mauSignups} />
        </div>

        {/* All time */}
        <SectionHeading>All time</SectionHeading>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <StatCard label="Registered users" value={totalUsers} />
          <StatCard label="Total completions" value={totalCompletions} />
          <StatCard label="Unique players" value={totalUniquePlayers} />
        </div>

        {/* Top 10 today */}
        <SectionHeading>Today&rsquo;s top 10</SectionHeading>
        {topToday.length === 0 ? (
          <EmptyCard>No scores submitted today yet.</EmptyCard>
        ) : (
          <ol className="bg-surface border border-border rounded-lg overflow-hidden">
            {topToday.map((row, i) => (
              <li
                key={`${row.player_name ?? "anon"}-${i}`}
                className="flex items-center gap-4 px-5 py-3 border-b border-border/60 last:border-b-0"
              >
                <span
                  className={`font-display text-[20px] leading-none w-10 shrink-0 ${i === 0 ? "text-spotify" : "text-muted"}`}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex-1 truncate text-foreground">
                  {row.player_name ?? "—"}
                </span>
                <span className="font-mono text-[13px] tabular-nums text-spotify">
                  {row.score}
                </span>
              </li>
            ))}
          </ol>
        )}

        {/* Recent signups */}
        <SectionHeading>Recent signups</SectionHeading>
        {recentSignups.length === 0 ? (
          <EmptyCard>
            No recent signups. (If you expected some, check that the
            service-role key is configured — auth.users needs admin access.)
          </EmptyCard>
        ) : (
          <ol className="bg-surface border border-border rounded-lg overflow-hidden">
            {recentSignups.map((u, i) => (
              <li
                key={u.id}
                className="flex items-center gap-4 px-5 py-3 border-b border-border/60 last:border-b-0"
              >
                <span className="font-display text-[20px] leading-none w-10 shrink-0 text-muted">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex-1 truncate text-foreground break-all">
                  {u.email ?? "(no email)"}
                </span>
                <span className="font-mono text-[11px] tracking-[1px] text-muted shrink-0">
                  {formatDateTime(u.created_at)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}

// ---------- Small helpers ----------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 mt-12 mb-5">
      <span aria-hidden className="block w-8 h-px bg-spotify shrink-0" />
      <h2
        className="font-display tracking-[2px] leading-none text-foreground"
        style={{ fontSize: "clamp(22px, 3vw, 32px)" }}
      >
        {children}
      </h2>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-lg p-5">
      <div className="font-mono text-[10px] tracking-[2px] uppercase text-muted">
        {label}
      </div>
      <div className="mt-2 font-mono text-3xl sm:text-4xl tabular-nums leading-none text-foreground">
        {value.toLocaleString()}
      </div>
      {hint && (
        <div className="mt-2 font-mono text-[9px] tracking-[1px] uppercase text-muted">
          {hint}
        </div>
      )}
    </div>
  );
}

// Full-width hero variant of StatCard. Used for the headline metric at
// the top of the Daily Active section so it visually outranks the
// per-mode breakdown below it.
function HeroStatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="bg-surface border border-spotify/40 rounded-lg p-6 sm:p-8">
      <div className="font-mono text-[11px] tracking-[3px] uppercase text-spotify">
        {label}
      </div>
      <div
        className="mt-3 font-display tabular-nums leading-none text-spotify"
        style={{ fontSize: "clamp(48px, 8vw, 88px)" }}
      >
        {value.toLocaleString()}
      </div>
      {hint && (
        <div className="mt-3 font-mono text-[10px] tracking-[1px] uppercase text-muted">
          {hint}
        </div>
      )}
    </div>
  );
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-5 font-mono text-[11px] tracking-[2px] uppercase text-muted">
      {children}
    </div>
  );
}

// Side-by-side starts + completes for one game mode, with a conversion
// rate hint when there were any starts today.
function ModeCard({
  label,
  starts,
  completes,
}: {
  label: string;
  starts: number;
  completes: number;
}) {
  const rate = starts > 0 ? Math.round((completes / starts) * 100) : null;
  return (
    <div className="bg-surface border border-border rounded-lg p-5">
      <div className="font-mono text-[10px] tracking-[2px] uppercase text-muted">
        {label}
      </div>
      <div className="mt-3 flex items-baseline gap-6">
        <div>
          <div className="font-mono text-[9px] tracking-[1px] uppercase text-muted">
            Starts
          </div>
          <div className="font-mono text-2xl sm:text-3xl tabular-nums leading-none text-foreground">
            {starts.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="font-mono text-[9px] tracking-[1px] uppercase text-muted">
            Completes
          </div>
          <div className="font-mono text-2xl sm:text-3xl tabular-nums leading-none text-spotify">
            {completes.toLocaleString()}
          </div>
        </div>
      </div>
      {rate !== null && (
        <div className="mt-3 font-mono text-[9px] tracking-[1px] uppercase text-muted">
          {rate}% completion
        </div>
      )}
    </div>
  );
}

