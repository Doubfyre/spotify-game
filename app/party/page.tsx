import Link from "next/link";

type Option = {
  num: string;
  icon: string;
  name: string;
  desc: string;
  tag: string;
  href: string;
};

const OPTIONS: Option[] = [
  {
    num: "01",
    icon: "📱",
    name: "Pass & Play",
    desc: "Everyone shares one device. Add 2–8 players, take turns on each round. No accounts, no internet magic — just pass the phone.",
    tag: "Same device",
    href: "/party/passplay",
  },
  {
    num: "02",
    icon: "🌐",
    name: "Online Play",
    desc: "Host a live room and share a 4-letter code. Each player uses their own device, 30 seconds per turn, live standings after every round.",
    tag: "Sign-in required",
    href: "/party/online",
  },
];

export default function PartyPage() {
  return (
    <main className="flex-1 flex flex-col px-5 sm:px-10 pt-32 pb-16">
      <div className="w-full max-w-5xl mx-auto">
        <div className="flex items-center gap-[10px] font-mono text-[11px] tracking-[3px] uppercase text-spotify font-medium mb-4">
          <span className="w-6 h-px bg-spotify" />
          Party mode
        </div>
        <h1
          className="font-display leading-none tracking-[2px] text-foreground"
          style={{ fontSize: "clamp(48px, 8vw, 96px)" }}
        >
          PLAY WITH
          <br />
          FRIENDS
        </h1>
        <p className="text-muted mt-4 font-light max-w-lg">
          Two ways to play. Same-room with one device, or a live online room —
          same rules, different setup.
        </p>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-[2px]">
          {OPTIONS.map((o) => (
            <OptionCard key={o.num} option={o} />
          ))}
        </div>

        <div className="mt-10">
          <Link
            href="/"
            className="font-mono text-[11px] tracking-[2px] uppercase text-muted hover:text-foreground transition"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}

function OptionCard({ option }: { option: Option }) {
  return (
    <Link href={option.href} className="block">
      <article className="group relative bg-surface p-10 border border-transparent hover:border-spotify hover:-translate-y-0.5 cursor-pointer transition overflow-hidden">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            background:
              "linear-gradient(135deg, rgba(31,223,100,0.05) 0%, transparent 60%)",
          }}
        />
        <div className="relative">
          <div className="font-display leading-none text-[72px] mb-4 text-white/[0.06] group-hover:text-spotify/15 transition-colors">
            {option.num}
          </div>
          <span className="block text-[28px] mb-5" aria-hidden>
            {option.icon}
          </span>
          <div className="font-display text-[32px] tracking-[2px] mb-3 text-foreground">
            {option.name}
          </div>
          <p className="text-[14px] text-muted leading-[1.6] mb-7">
            {option.desc}
          </p>
          <span className="inline-flex items-center gap-[6px] font-mono text-[10px] tracking-[2px] uppercase px-[10px] py-[5px] rounded-sm border border-border text-muted group-hover:border-spotify group-hover:text-spotify transition">
            <span className="w-[5px] h-[5px] rounded-full bg-current" />
            {option.tag}
          </span>
        </div>
      </article>
    </Link>
  );
}
