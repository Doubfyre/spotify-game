import type { Metadata } from "next";
import Link from "next/link";
import { Bebas_Neue, DM_Sans, DM_Mono } from "next/font/google";
import "./globals.css";

const bebasNeue = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas-neue",
  display: "swap",
});

const dmSans = DM_Sans({
  weight: ["300", "400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const dmMono = DM_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-dm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Spotify Game",
  description:
    "Guess which artists are hiding near the edge of Spotify's top 500.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${bebasNeue.variable} ${dmSans.variable} ${dmMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Nav />
        {children}
      </body>
    </html>
  );
}

function Nav() {
  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-5 sm:px-10 py-5"
      style={{
        background:
          "linear-gradient(to bottom, rgba(10,10,10,0.95) 0%, transparent 100%)",
        backdropFilter: "blur(2px)",
      }}
    >
      <Link
        href="/"
        className="font-display text-[22px] sm:text-[28px] tracking-[0.2em] flex items-center gap-2 text-foreground"
      >
        <span className="inline-block w-2 h-2 rounded-full bg-spotify animate-pulse-dot" />
        THE SPOTIFY GAME
      </Link>
      <div className="flex items-center gap-3 sm:gap-4">
        <button
          type="button"
          className="border border-border text-foreground rounded-[4px] px-4 sm:px-5 py-2 text-[13px] font-medium tracking-[0.3px] hover:border-spotify hover:text-spotify transition"
        >
          Log In
        </button>
        <button
          type="button"
          className="bg-spotify border border-spotify text-background rounded-[4px] px-4 sm:px-5 py-2 text-[13px] font-medium tracking-[0.3px] hover:bg-spotify-bright hover:border-spotify-bright transition"
        >
          Sign Up Free
        </button>
      </div>
    </nav>
  );
}
