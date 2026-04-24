"use client";

import { useState } from "react";

type Props = {
  imageHash: string | null | undefined;
  alt: string;
  size: number;
  className?: string;
};

/**
 * Round artist photo from Spotify's image CDN, with a dark fallback circle
 * (🎵) if the hash is missing or the image fails to load.
 *
 * Uses a plain <img> rather than next/image — Spotify's CDN is already
 * serving optimised WebP/JPEG at the right sizes, and configuring
 * `remotePatterns` just for i.scdn.co isn't worth it for a thumbnail.
 */
export default function ArtistAvatar({
  imageHash,
  alt,
  size,
  className = "",
}: Props) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };

  if (!imageHash || failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        style={style}
        className={`rounded-full bg-background border border-border flex items-center justify-center shrink-0 ${className}`}
      >
        <span
          aria-hidden
          className="text-muted leading-none"
          style={{ fontSize: Math.round(size * 0.45) }}
        >
          🎵
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://i.scdn.co/image/${imageHash}`}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`rounded-full object-cover shrink-0 ${className}`}
      style={style}
    />
  );
}
