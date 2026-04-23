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

// Reads the session cookie on every render. Running this in the root layout
// opts the whole app into dynamic rendering, which is what we want for an
// auth-aware shell. For email/password accounts user_metadata is usually
// empty, so we show the email local-part as the display name.
async function getNavUser(): Promise<NavUser> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const displayName =
    user.email?.split("@")[0]?.trim() ||
    (user.user_metadata?.full_name as string | undefined) ||
    "You";
  return { displayName, avatarUrl: null };
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
