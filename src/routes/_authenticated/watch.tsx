import { createFileRoute } from "@tanstack/react-router";
import { Tv } from "lucide-react";
import { WatchLive } from "@/components/WatchLive";

export const Route = createFileRoute("/_authenticated/watch")({
  head: () => ({ meta: [{ title: "Watch Live · Focus World Cup Pool" }] }),
  component: WatchPage,
});

// Set this to a stream you are LICENSED to embed — e.g. an official FIFA+ or
// broadcaster player URL. Leave empty to show only the official "where to watch"
// links. Do NOT point this at unauthorized re-stream/aggregator URLs: that is
// copyright infringement and those embeds inject ads/malware.
const WATCH_EMBED_URL = "";

function WatchPage() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="flex items-center gap-2 font-display text-4xl font-bold">
          <Tv className="size-8 text-primary" /> Watch Live
        </h1>
        <p className="mt-2 text-muted-foreground">
          Catch every match. Open the official broadcaster for your region below.
        </p>
      </header>

      {WATCH_EMBED_URL ? (
        <div className="overflow-hidden rounded-3xl border border-border bg-night shadow-card">
          <div className="relative aspect-video">
            <iframe
              src={WATCH_EMBED_URL}
              title="Live match"
              className="absolute inset-0 size-full"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />
          </div>
        </div>
      ) : (
        <div className="flex aspect-video w-full flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-surface p-6 text-center">
          <Tv className="size-10 text-muted-foreground" />
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">
            No in-app stream connected. Add a licensed embed URL to play the match here, or use an
            official broadcaster below.
          </p>
        </div>
      )}

      <WatchLive />
    </div>
  );
}
