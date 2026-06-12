import { PlayCircle, Youtube } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Highlights are set per match by an admin (matches.highlights_url) — see
// MatchHighlightsAdmin. Curated by hand because no source reliably gives real,
// region-playable highlights per match (official broadcaster clips are geo-locked;
// most globally-available uploads are FIFA-game simulations).

// Turn a pasted YouTube/share/embed URL into an embeddable iframe src. Returns
// null when nothing usable is set (popup then shows a search link).
function toEmbedUrl(raw?: string | null): string | null {
  const url = (raw ?? "").trim();
  if (!url) return null;
  const id =
    url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/)?.[1] ??
    url.match(/[?&]v=([A-Za-z0-9_-]{6,})/)?.[1] ??
    url.match(/youtube(?:-nocookie)?\.com\/(?:embed|shorts)\/([A-Za-z0-9_-]{6,})/)?.[1];
  if (id) return `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
  // Non-YouTube but already an absolute URL — embed as-is (best effort).
  return /^https?:\/\//.test(url) ? url : null;
}

function youtubeSearchUrl(nameA?: string, nameB?: string): string {
  const q = `${nameA ?? "Team A"} vs ${nameB ?? "Team B"} 2026 World Cup highlights`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}

/**
 * Compact "Highlights" button → popup that embeds the match's highlights video
 * (matches.highlights_url, set by an admin). Falls back to a YouTube search link
 * when no URL is set. `compact` renders an icon-only trigger (for table rows).
 */
export function MatchHighlights({ match, compact = false }: { match: any; compact?: boolean }) {
  const a = match.team_a;
  const b = match.team_b;
  const embedUrl = toEmbedUrl(match.highlights_url);
  const hasScore = match.score_a != null && match.score_b != null;
  return (
    <Dialog>
      <DialogTrigger asChild>
        {compact ? (
          <button
            title="Watch highlights"
            className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-bold text-foreground transition hover:border-primary hover:bg-primary/5"
          >
            <PlayCircle className="size-3.5 text-primary" /> Highlights
          </button>
        ) : (
          <button className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-border bg-background px-3 py-2 text-xs font-bold text-foreground transition hover:border-primary hover:bg-primary/5">
            <PlayCircle className="size-4 text-primary" /> Highlights
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlayCircle className="size-5 text-primary" />
            {a?.name ?? "TBD"} vs {b?.name ?? "TBD"}
            {hasScore && (
              <span className="text-muted-foreground">
                · {match.score_a}–{match.score_b}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>Match highlights</DialogDescription>
        </DialogHeader>
        {embedUrl ? (
          <div className="space-y-3">
            <div className="relative aspect-video overflow-hidden rounded-xl border border-border bg-night">
              <iframe
                src={embedUrl}
                title={`${a?.name ?? "Team A"} vs ${b?.name ?? "Team B"} highlights`}
                className="absolute inset-0 size-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
            <a
              href={(match.highlights_url ?? "").trim()}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
            >
              <Youtube className="size-4" /> Watch on YouTube
            </a>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-surface p-8 text-center">
            <Youtube className="size-9 text-muted-foreground" />
            <p className="max-w-sm text-sm text-muted-foreground">
              Highlights for this match aren&apos;t set yet — find the latest clips on YouTube.
            </p>
            <a
              href={youtubeSearchUrl(a?.name, b?.name)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition hover:scale-105"
            >
              <Youtube className="size-4" /> Search highlights on YouTube
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
