import type { Metadata } from "next";
import { Bebas_Neue, DM_Sans, DM_Mono } from "next/font/google";
import "./globals.css";
import { createServerSupabase } from "@/lib/supabase-server";
import Nav, { type NavUser } from "./_components/Nav";

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

// Reads the session cookie on every render. Cheap — it's an in-memory JWT
// decode, no network hop. Running this in the root layout opts the whole app
// into dynamic rendering, which is what we want for an auth-aware shell.
async function getNavUser(): Promise<NavUser> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Google provides full_name + picture; Apple usually only gives email the
  // first time and little else. Fall back gracefully.
  const meta = user.user_metadata ?? {};
  const nameSource: string =
    meta.full_name ?? meta.name ?? user.email?.split("@")[0] ?? "You";
  const firstName = nameSource.trim().split(/\s+/)[0] || "You";
  const avatarUrl: string | null =
    meta.avatar_url ?? meta.picture ?? null;
  return { firstName, avatarUrl };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getNavUser();
  return (
    <html
      lang="en"
      className={`${bebasNeue.variable} ${dmSans.variable} ${dmMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Nav user={user} />
        {children}
      </body>
    </html>
  );
}
