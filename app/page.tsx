import Link from "next/link";

// Deterministic floating-number config. Hardcoded (not Math.random()) so the
// server-rendered markup matches the client render — avoids a hydration mismatch.
type FloatNum = {
  n: string;
  left: string;
  size: number;
  dur: number;
  delay: number;
};
const FLOATING_NUMBERS: FloatNum[] = [
  { n: "500", left: "4%", size: 90, dur: 22, delay: -5 },
  { n: "487", left: "12%", size: 140, dur: 28, delay: -12 },
  { n: "312", left: "20%", size: 70, dur: 18, delay: -20 },
  { n: "245", left: "28%", size: 110, dur: 24, delay: -8 },
  { n: "178", left: "38%", size: 85, dur: 30, delay: -16 },
  { n: "401", left: "47%", size: 125, dur: 20, delay: -22 },
  { n: "23", left: "56%", size: 95, dur: 26, delay: -11 },
  { n: "356", left: "64%", size: 130, dur: 32, delay: -3 },
  { n: "89", left: "72%", size: 75, dur: 19, delay: -18 },
  { n: "467", left: "80%", size: 110, dur: 27, delay: -9 },
  { n: "499", left: "88%", size: 100, dur: 23, delay: -14 },
  { n: "201", left: "94%", size: 120, dur: 29, delay: -6 },
];

const TICKER_ARTISTS = [
  "TAYLOR SWIFT",
  "DRAKE",
  "THE WEEKND",
  "BAD BUNNY",
  "DOJA CAT",
  "IMAGINE DRAGONS",
  "ANITTA",
  "ED SHEERAN",
  "BILLIE EILISH",
  "POST MALONE",
  "KENDRICK LAMAR",
  "SZA",
  "ARCTIC MONKEYS",
  "SABRINA CARPENTER",
];

const STATS = [
  { num: "500", label: "Artists Ranked Daily" },
  { num: "3", label: "Game Modes" },
  { num: "5", label: "Rounds per Game" },
  { num: "24H", label: "Daily Reset" },
];

type Mode = {
  num: string;
  icon: string;
  name: string;
  desc: string;
  tag: string;
  href?: string;
};
const MODES: Mode[] = [
  {
    num: "01",
    icon: "🎯",
    name: "Solo Play",
    desc: "Five rounds. Pick artists you think are in the top 500. Your score is their rank — highest cumulative score across five rounds wins.",
    tag: "No account needed",
    href: "/solo",
  },
  {
    num: "02",
    icon: "📅",
    name: "Daily Challenge",
    desc: "Three artists revealed each day. Guess their rank in the top 500. Lowest score wins — one attempt, everyone plays the same puzzle.",
    tag: "Live daily",
    href: "/daily",
  },
  {
    num: "03",
    icon: "🎉",
    name: "Party Mode",
    desc: "Play live with friends — in the same room or online. Create a room, share the code, take turns across five rounds.",
    tag: "Coming soon",
  },
];

export default function Home() {
  return (
    <main className="flex-1">
      <Hero />
      <Ticker />
      <Modes />
    </main>
  );
}

function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col overflow-hidden px-5 sm:px-10 pt-[120px] pb-10">
      {/* radial gradients */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 70% 50%, rgba(31,223,100,0.07) 0%, transparent 70%)," +
            "radial-gradient(ellipse 40% 60% at 20% 80%, rgba(245,166,35,0.05) 0%, transparent 60%)," +
            "radial-gradient(ellipse 50% 40% at 80% 20%, rgba(31,223,100,0.04) 0%, transparent 60%)",
        }}
      />

      {/* floating rank numbers */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {FLOATING_NUMBERS.map((bg, i) => (
          <div
            key={i}
            className="absolute font-display select-none animate-float-up"
            style={{
              left: bg.left,
              fontSize: `${bg.size}px`,
              color: "rgba(255,255,255,0.025)",
              animationDuration: `${bg.dur}s`,
              animationDelay: `${bg.delay}s`,
            }}
          >
            {bg.n}
          </div>
        ))}
      </div>

      {/* content — flows from its natural top. Don't wrap in a flex-1 centered
         box: the title can be taller than the box and `items-center` would
         overflow symmetrically, spilling the bottom into the stats bar and
         making its border-t appear to slice the CTA buttons. */}
      <div className="relative z-[2] max-w-[900px]">
        <div className="flex items-center gap-[10px] mb-7">
          <span className="w-8 h-px bg-spotify" />
          <span className="font-mono text-[11px] tracking-[3px] uppercase text-spotify font-medium">
            The Spotify Ranking Game
          </span>
        </div>

        <h1
          className="font-display leading-[0.9] tracking-[2px] text-foreground mb-4"
          style={{ fontSize: "clamp(80px, 14vw, 180px)" }}
        >
          THE
          <br />
          SPOTIFY
          <br />
          <span className="text-spotify">GAME</span>
        </h1>

        <p
          className="font-light text-muted max-w-[500px] leading-[1.5] mb-12"
          style={{ fontSize: "clamp(16px, 2vw, 22px)" }}
        >
          <strong className="text-foreground font-medium">
            Don&rsquo;t aim for number one.
          </strong>{" "}
          Guess which artists are hiding near the edge of Spotify&rsquo;s top
          500 — and get as close as you can.
        </p>

        <div className="flex gap-4 items-center flex-wrap">
          <Link
            href="/solo"
            className="inline-flex items-center gap-2 bg-spotify text-background font-bold text-[15px] tracking-[0.5px] px-9 py-4 rounded-[4px] transition hover:-translate-y-px hover:bg-spotify-bright"
            style={{
              boxShadow: "0 0 0 rgba(31,223,100,0)",
              transition:
                "transform 0.2s, background 0.2s, box-shadow 0.2s",
            }}
          >
            Play Solo
            <span aria-hidden>→</span>
          </Link>
          <Link
            href="#modes"
            className="inline-flex items-center bg-transparent border border-border text-foreground text-[15px] px-9 py-4 rounded-[4px] transition hover:border-foreground hover:-translate-y-px"
          >
            See Game Modes
          </Link>
        </div>
      </div>

      {/* stats bar — mt-auto pins it to the bottom of the flex column; when
         content is too tall to leave extra space the margin collapses to 0
         and the section grows past min-h-screen instead of overlapping. */}
      <div className="hidden md:flex gap-10 relative z-[2] border-t border-border pt-6 mt-auto">
        {STATS.map((s) => (
          <div key={s.label} className="flex flex-col gap-1">
            <span className="font-display text-[32px] tracking-[2px] leading-none text-foreground">
              {s.num}
            </span>
            <span className="font-sans text-[11px] tracking-[2px] uppercase text-muted">
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Ticker() {
  // Duplicate once for the infinite scroll (translate -50% lines up seamlessly).
  const items = [...TICKER_ARTISTS, ...TICKER_ARTISTS];
  return (
    <div className="bg-spotify text-background border-t border-b border-border overflow-hidden py-[10px]">
      <div className="flex whitespace-nowrap animate-ticker">
        {items.map((a, i) => (
          <span
            key={i}
            className="flex-shrink-0 font-display text-[14px] tracking-[3px] px-8 opacity-80"
          >
            {a}
            <span className="opacity-40 px-2">·</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Modes() {
  return (
    <section
      id="modes"
      className="relative bg-off-black border-t border-b border-border py-24 px-5 sm:px-10"
    >
      <div className="mb-14">
        <div className="flex items-center gap-[10px] font-mono text-[11px] tracking-[3px] uppercase text-spotify font-medium mb-4">
          <span className="w-6 h-px bg-spotify" />
          Game Modes
        </div>
        <h2
          className="font-display tracking-[2px] leading-none"
          style={{ fontSize: "clamp(40px, 6vw, 72px)" }}
        >
          THREE WAYS
          <br />
          TO PLAY
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-[2px]">
        {MODES.map((mode) => (
          <ModeCard key={mode.num} mode={mode} />
        ))}
      </div>
    </section>
  );
}

function ModeCard({ mode }: { mode: Mode }) {
  const active = Boolean(mode.href);

  const inner = (
    <article
      className={`group relative bg-surface p-10 border border-transparent transition overflow-hidden
        ${active ? "hover:border-spotify hover:-translate-y-0.5 cursor-pointer" : "opacity-90"}`}
    >
      {/* hover gradient wash */}
      {active && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            background:
              "linear-gradient(135deg, rgba(31,223,100,0.05) 0%, transparent 60%)",
          }}
        />
      )}

      <div className="relative">
        <div
          className={`font-display leading-none text-[72px] mb-4 transition-colors
            ${active ? "text-white/[0.06] group-hover:text-spotify/15" : "text-white/[0.06]"}`}
        >
          {mode.num}
        </div>
        <span className="block text-[28px] mb-5" aria-hidden>
          {mode.icon}
        </span>
        <div className="font-display text-[32px] tracking-[2px] mb-3 text-foreground">
          {mode.name}
        </div>
        <p className="text-[14px] text-muted leading-[1.6] mb-7">
          {mode.desc}
        </p>
        <span
          className={`inline-flex items-center gap-[6px] font-mono text-[10px] tracking-[2px] uppercase px-[10px] py-[5px] rounded-sm border transition
            ${active ? "border-border text-muted group-hover:border-spotify group-hover:text-spotify" : "border-border text-muted"}`}
        >
          <span className="w-[5px] h-[5px] rounded-full bg-current" />
          {mode.tag}
        </span>
      </div>
    </article>
  );

  if (!active) return inner;
  return (
    <Link href={mode.href!} className="block">
      {inner}
    </Link>
  );
}
