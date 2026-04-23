import Link from "next/link";
import HowToPlayButton from "./HowToPlayButton";

export type NavUser = {
  displayName: string;
  avatarUrl: string | null;
} | null;

export default function Nav({ user }: { user: NavUser }) {
  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-2 px-3 sm:px-10 py-4 sm:py-5"
      style={{
        background:
          "linear-gradient(to bottom, rgba(10,10,10,0.95) 0%, transparent 100%)",
        backdropFilter: "blur(2px)",
      }}
    >
      <Link
        href="/"
        className="font-display text-[13px] sm:text-[28px] tracking-[0.05em] sm:tracking-[0.2em] flex items-center gap-1.5 sm:gap-2 text-foreground whitespace-nowrap"
      >
        <span className="inline-block w-2 h-2 rounded-full bg-spotify animate-pulse-dot" />
        THE SPOTIFY GAME
      </Link>
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <HowToPlayButton />
        {user ? <UserMenu user={user} /> : <AuthButtons />}
      </div>
    </nav>
  );
}

function AuthButtons() {
  return (
    <>
      <Link
        href="/signin"
        className="border border-border text-foreground rounded-[4px] px-3 sm:px-5 py-1.5 sm:py-2 text-[11px] sm:text-[13px] font-medium tracking-[0.3px] hover:border-spotify hover:text-spotify transition"
      >
        Log In
      </Link>
      <Link
        href="/signin"
        className="bg-spotify border border-spotify text-background rounded-[4px] px-3 sm:px-5 py-1.5 sm:py-2 text-[11px] sm:text-[13px] font-medium tracking-[0.3px] hover:bg-spotify-bright hover:border-spotify-bright transition whitespace-nowrap"
      >
        Sign Up<span className="hidden sm:inline"> Free</span>
      </Link>
    </>
  );
}

function UserMenu({ user }: { user: NonNullable<NavUser> }) {
  // Clicking the avatar/name navigates to /profile. Sign-out lives on the
  // profile page so the nav stays link-simple (no dropdown state).
  return (
    <Link
      href="/profile"
      className="flex items-center gap-2 border border-border text-foreground rounded-[4px] px-3 py-1.5 text-[11px] sm:text-[13px] font-medium tracking-[0.3px] hover:border-foreground transition"
    >
      {user.avatarUrl ? (
        // Plain <img> — OAuth avatars live on arbitrary hosts and configuring
        // next/image remotePatterns per-provider isn't worth it for a ~24px
        // thumbnail.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.avatarUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="w-6 h-6 rounded-full object-cover"
        />
      ) : (
        <span className="w-6 h-6 rounded-full bg-spotify text-background flex items-center justify-center text-[11px] font-bold">
          {user.displayName.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="hidden sm:inline">{user.displayName}</span>
    </Link>
  );
}
