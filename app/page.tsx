import ModesSection from "./_components/ModesSection";
import { getTodayLondon } from "@/lib/dates";
import { createServerSupabase } from "@/lib/supabase-server";

// Deterministic floating-number config. Hardcoded (not Math.random()) so the
// server-rendered markup matches the client render — avoids a hydration
// mismatch. Opacity is intentionally low so these read as atmosphere, not
// content.
type FloatNum = {
  n: string;
  left: string;
  size: number;
  dur: number;
  delay: number;
};
const FLOATING_NUMBERS: FloatNum[] = [
  { n: "500", left: "4%", size: 90, dur: 22, delay: -5 },
  { n: "342", left: "12%", size: 140, dur: 28, delay: -12 },
  { n: "312", left: "22%", size: 70, dur: 18, delay: -20 },
  { n: "245", left: "30%", size: 110, dur: 24, delay: -8 },
  { n: "178", left: "40%", size: 85, dur: 30, delay: -16 },
  { n: "401", left: "50%", size: 125, dur: 20, delay: -22 },
  { n: "23", left: "60%", size: 95, dur: 26, delay: -11 },
  { n: "356", left: "70%", size: 130, dur: 32, delay: -3 },
  { n: "467", left: "82%", size: 110, dur: 27, delay: -9 },
  { n: "499", left: "92%", size: 100, dur: 23, delay: -14 },
];

const MONTHS_SHORT = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

// Today's date and tag derived from London time so everything on the page
// lines up with the midnight-UK reset used elsewhere in the app.
function todayLondon(): { snapshot: string; tag: string } {
  const snapshot = getTodayLondon();
  const [, mm, dd] = snapshot.split("-").map(Number);
  // Build the tag directly from the ISO parts — `snapshot` is already
  // London-local, so no second timezone conversion is needed.
  return { snapshot, tag: `${dd} ${MONTHS_SHORT[mm - 1]}` };
}

export default async function Home() {
  const { snapshot, tag } = todayLondon();

  // Cross-device "completed today" check: for logged-in users, the source
  // of truth is a row in daily_scores. Falls back to the client's
  // localStorage check inside ModesSection for anonymous visitors.
  let serverDailyCompleted = false;
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("daily_scores")
        .select("id")
        .eq("user_id", user.id)
        .eq("snapshot_date", snapshot)
        .limit(1)
        .maybeSingle();
      if (data) serverDailyCompleted = true;
    }
  } catch {
    // Auth/query failure should not block the homepage — card just falls
    // back to localStorage detection.
  }

  return (
    <main className="relative flex flex-col min-h-[100dvh] md:h-[100dvh] md:overflow-hidden pt-[80px]">
      {/* radial-gradient backdrop */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 70% 50%, rgba(31,223,100,0.07) 0%, transparent 70%)," +
            "radial-gradient(ellipse 40% 60% at 20% 80%, rgba(245,166,35,0.05) 0%, transparent 60%)," +
            "radial-gradient(ellipse 50% 40% at 80% 20%, rgba(31,223,100,0.04) 0%, transparent 60%)",
        }}
      />

      {/* floating rank numbers */}
      <div
        aria-hidden
        className="absolute inset-0 overflow-hidden pointer-events-none"
      >
        {FLOATING_NUMBERS.map((bg, i) => (
          <div
            key={i}
            className="absolute font-display select-none animate-float-up"
            style={{
              left: bg.left,
              fontSize: `${bg.size}px`,
              color: "rgba(255,255,255,0.018)",
              animationDuration: `${bg.dur}s`,
              animationDelay: `${bg.delay}s`,
            }}
          >
            {bg.n}
          </div>
        ))}
      </div>

      {/* TOP ~40%: title + subtitle */}
      <section className="relative z-[2] md:flex-[4] flex items-center px-5 sm:px-10 py-3 md:py-0">
        <div className="w-full max-w-4xl">
          <div className="flex items-center gap-[10px] mb-3 sm:mb-5">
            <span className="w-8 h-px bg-spotify" />
            <span className="font-mono text-[10px] sm:text-[11px] tracking-[2px] sm:tracking-[3px] uppercase text-spotify font-medium">
              The Spotify Ranking Game
            </span>
          </div>
          <h1
            className="font-display leading-[0.95] tracking-[2px] text-foreground mb-2 sm:mb-4"
            style={{ fontSize: "clamp(40px, 10vw, 128px)" }}
          >
            THE SPOTIFY
            <br />
            <span className="text-spotify">GAME</span>
          </h1>
          <p className="font-light text-muted text-sm sm:text-lg max-w-xl">
            Guess which artists are hiding in Spotify&rsquo;s top 500.
          </p>
        </div>
      </section>

      {/* BOTTOM ~60%: mode cards. ModesSection handles the modal state.
          `flex-1 flex flex-col` on mobile so the grid fills remaining
          viewport height — `h-full` alone doesn't compute because the
          main's height comes from `min-h-[100dvh]` (not a definite
          height), so we thread the flex chain all the way down. */}
      <section className="relative z-[2] flex-1 md:flex-[6] flex flex-col px-5 sm:px-10 pb-3 sm:pb-6 md:pb-10 min-h-0">
        <ModesSection
          todaySnapshot={snapshot}
          todayTag={tag}
          serverDailyCompleted={serverDailyCompleted}
        />
      </section>
    </main>
  );
}
