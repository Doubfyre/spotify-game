import type { NextConfig } from "next";

// Baseline security headers applied to every route. None of these are
// behaviour-changing for our pages — we don't embed iframes, ask for
// camera/mic, or rely on cross-origin referers.
const SECURITY_HEADERS = [
  // Stop the browser from MIME-sniffing a response away from its
  // declared Content-Type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send the full referer to same-origin requests, only the origin
  // (no path) cross-origin, and nothing on HTTPS → HTTP downgrades.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Refuse to render the site inside any frame — protects against
  // clickjacking of the daily-challenge / leaderboard submit flows.
  { key: "X-Frame-Options", value: "DENY" },
  // Lock down browser-feature access. We don't use any of these.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
