import { CLUB_CRESTS } from "@/lib/clubCrests";

/** An infinitely scrolling band of the 20 Premier League club crests. */
export function CrestMarquee({
  size = 44,
  gap = 32,
  duration = 42,
  className = "",
}: {
  size?: number;
  gap?: number;
  duration?: number;
  className?: string;
}) {
  const row = [...CLUB_CRESTS, ...CLUB_CRESTS];
  return (
    <div
      className={`relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)] ${className}`}
    >
      <style>{`@keyframes fp-marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
      <div
        className="flex w-max items-center"
        style={{ gap, animation: `fp-marquee ${duration}s linear infinite` }}
      >
        {row.map((src, i) => (
          <img
            key={i}
            src={src}
            alt=""
            loading="lazy"
            style={{ width: size, height: size }}
            className="shrink-0 object-contain drop-shadow"
          />
        ))}
      </div>
    </div>
  );
}
