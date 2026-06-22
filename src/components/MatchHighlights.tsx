import { PlayCircle, Youtube, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Per-match highlights, keyed by team codes (order-independent). This code map is
// the source until/unless an admin sets matches.highlights_url in the DB, which
// then takes precedence (see MatchHighlightsAdmin). Curated by hand: no source
// reliably gives real, Nepal-playable, embeddable highlights per match (official
// broadcaster clips are geo-locked; many global uploads are FIFA-game sims or
// have embedding disabled). Each entry below is verified embeddable.
const HIGHLIGHTS: Record<string, string> = {
  "MEX-RSA": "https://www.youtube.com/watch?v=DjYkkRPqV18", // Mexico 2-0 SA — DD India (real, NP)
  "KOR-CZE": "https://www.youtube.com/watch?v=KoRu-I4oqf4", // South Korea 2-1 Czechia (embeddable)
};
function fallbackHighlight(codeA?: string, codeB?: string): string {
  if (!codeA || !codeB) return "";
  return HIGHLIGHTS[`${codeA}-${codeB}`] ?? HIGHLIGHTS[`${codeB}-${codeA}`] ?? "";
}

type Embed = { src: string; kind: "youtube" | "tiktok" | "other" };

// Turn a pasted YouTube or TikTok (or other) URL into an embeddable iframe.
// `kind` drives the player aspect ratio (TikTok is vertical) and the "watch on…"
// link. Returns null when nothing usable is set (popup then shows a search link).
function toEmbed(raw?: string | null): Embed | null {
  const url = (raw ?? "").trim();
  if (!url) return null;
  // YouTube — watch/share/shorts/embed forms.
  const ytId =
    url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/)?.[1] ??
    url.match(/[?&]v=([A-Za-z0-9_-]{6,})/)?.[1] ??
    url.match(/youtube(?:-nocookie)?\.com\/(?:embed|shorts)\/([A-Za-z0-9_-]{6,})/)?.[1];
  if (ytId) return { src: `https://www.youtube-nocookie.com/embed/${ytId}?rel=0`, kind: "youtube" };
  // TikTok — a full video URL (…/video/<id>) or a bare numeric video id.
  const tkId =
    url.match(/tiktok\.com\/[^?#]*\/video\/(\d{8,25})/)?.[1] ??
    url.match(/[?&]item_id=(\d{8,25})/)?.[1] ??
    (/^\d{8,25}$/.test(url) ? url : undefined);
  if (tkId)
    return {
      src: `https://www.tiktok.com/player/v1/${tkId}?description=0&music_info=0`,
      kind: "tiktok",
    };
  // Other absolute URL — embed as-is (best effort).
  return /^https?:\/\//.test(url) ? { src: url, kind: "other" } : null;
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
  // DB value (if the column exists and is set) wins; otherwise the code map.
  const url = (match.highlights_url ?? "").trim() || fallbackHighlight(a?.code, b?.code);
  const embed = toEmbed(url);
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
        {embed ? (
          <div className="space-y-3">
            <div
              className={
                embed.kind === "tiktok"
                  ? "relative mx-auto aspect-[9/16] w-full max-w-[340px] overflow-hidden rounded-xl border border-border bg-night"
                  : "relative aspect-video overflow-hidden rounded-xl border border-border bg-night"
              }
            >
              <iframe
                src={embed.src}
                title={`${a?.name ?? "Team A"} vs ${b?.name ?? "Team B"} highlights`}
                className="absolute inset-0 size-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
            >
              {embed.kind === "youtube" ? (
                <>
                  <Youtube className="size-4" /> Watch on YouTube
                </>
              ) : embed.kind === "tiktok" ? (
                <>
                  <ExternalLink className="size-4" /> Watch on TikTok
                </>
              ) : (
                <>
                  <ExternalLink className="size-4" /> Open original
                </>
              )}
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
