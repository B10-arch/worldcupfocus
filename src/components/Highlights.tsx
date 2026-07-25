import { useState } from "react";
import { Play, Film } from "lucide-react";

/**
 * Premier League best-goals / highlights reels for the dashboard — a featured
 * YouTube player plus a pick-list. Sourced from the official Premier League
 * channel (its goal compilations are globally viewable, unlike geo-locked
 * full-match clips). The first entry is the auto-updating weekly-goals playlist.
 */
type Reel = { id: string; title: string; playlist?: boolean };
const REELS: Reel[] = [
  {
    id: "PLXEMPXZ3PY1he7fqYLqUCi3lWRXT7FyaW",
    title: "Every Goal, matchweek by matchweek",
    playlist: true,
  },
  { id: "Gyafe4HLy9Q", title: "The BEST Premier League goals of 2025/26" },
  { id: "ECy9JJndqBY", title: "Best goals of 2025/26 · Part 1" },
  { id: "7bwGAuuKEuQ", title: "Best goals of 2025/26 · Part 2" },
  { id: "pghK2A4fW3Q", title: "Best goals of 2026 so far" },
  { id: "3dfTnZCv6E4", title: "How did he stop that?! Best saves 2025/26" },
  { id: "Ne-YYlb2faM", title: "Best Premier League goals 2020–2025" },
  { id: "wz1r_VJaJZw", title: "1 hour of the best goals of the last 10 years" },
];

const embedOf = (r: Reel) =>
  r.playlist
    ? `https://www.youtube-nocookie.com/embed/videoseries?list=${r.id}`
    : `https://www.youtube-nocookie.com/embed/${r.id}?rel=0`;
const thumbOf = (r: Reel) => (r.playlist ? "" : `https://i.ytimg.com/vi/${r.id}/mqdefault.jpg`);

export function Highlights() {
  const [sel, setSel] = useState(0);
  const cur = REELS[sel];

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-display text-2xl font-bold">
            <Film className="size-6 text-magenta" /> Best Goals &amp; Highlights
          </h2>
          <p className="text-sm text-muted-foreground">
            Put your feet up and watch the Premier League&apos;s best — updated through the season.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        {/* Featured player */}
        <div className="overflow-hidden rounded-3xl border border-border bg-night shadow-card">
          <div className="relative aspect-video">
            <iframe
              key={cur.id}
              src={embedOf(cur)}
              title={cur.title}
              className="absolute inset-0 size-full"
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
            />
          </div>
          <p className="px-4 py-2.5 text-sm font-semibold">{cur.title}</p>
        </div>

        {/* Pick list */}
        <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto lg:max-h-[calc(56.25%+3rem)]">
          {REELS.map((r, i) => {
            const active = i === sel;
            return (
              <button
                key={r.id}
                onClick={() => setSel(i)}
                className={`flex items-center gap-3 rounded-2xl border p-2 text-left transition ${
                  active
                    ? "border-primary/50 bg-primary/5"
                    : "border-border bg-surface hover:border-primary/40"
                }`}
              >
                <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-night">
                  {r.playlist ? (
                    <div
                      className="flex size-full items-center justify-center text-white"
                      style={{ backgroundImage: "var(--gradient-brand)" }}
                    >
                      <Film className="size-5" />
                    </div>
                  ) : (
                    <img
                      src={thumbOf(r)}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  )}
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Play className="size-5 fill-white/90 text-white drop-shadow" />
                  </span>
                </div>
                <span className="min-w-0 flex-1 text-xs font-semibold leading-tight">
                  {r.title}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
