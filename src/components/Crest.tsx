/**
 * Renders a club badge. `src` may be a crest image URL (Premier League clubs) or
 * a plain emoji/text (fallback) — both are drawn at the same square box size so
 * layouts stay consistent. Falls back to ⚽ if a badge image fails to load.
 */
import { useState } from "react";

export function Crest({
  src,
  size = 24,
  className = "",
}: {
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const isUrl = typeof src === "string" && /^https?:\/\//.test(src) && !broken;

  if (isUrl) {
    return (
      <img
        src={src!}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setBroken(true)}
        className={`inline-block shrink-0 object-contain ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center leading-none ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.82) }}
    >
      {src && !/^https?:\/\//.test(src) ? src : "⚽"}
    </span>
  );
}
