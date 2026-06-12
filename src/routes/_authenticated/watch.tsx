import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tv, Trophy } from "lucide-react";

// Height of the masking bar that covers the embed's own header (the "BINTV"
// logo + search strip). Tune this if the provider's header height changes.
const EMBED_HEADER_MASK = "4rem";

export const Route = createFileRoute("/_authenticated/watch")({
  head: () => ({ meta: [{ title: "Watch Live · Focus World Cup Pool" }] }),
  component: WatchPage,
});

type LiveStream = { embed_url: string; title: string };

function WatchPage() {
  const { data } = useQuery({
    queryKey: ["live-stream"],
    refetchInterval: 30_000, // pick up the admin's changes without a manual reload
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("live_stream")
        .select("embed_url, title")
        .eq("id", true)
        .maybeSingle();
      return (data ?? { embed_url: "", title: "" }) as LiveStream;
    },
  });

  const url = (data?.embed_url ?? "").trim();
  const title = (data?.title ?? "").trim();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-display text-4xl font-bold">
          <Tv className="size-8 text-primary" /> Watch Live
        </h1>
        <p className="mt-2 text-muted-foreground">{title || "Live match stream."}</p>
      </header>

      {url ? (
        <div className="overflow-hidden rounded-3xl border border-border bg-night shadow-card">
          <div className="relative aspect-video">
            <iframe
              src={url}
              title={title || "Live match"}
              className="absolute inset-0 size-full"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />

            {/* Branded bar overlaying the embed's own "BINTV" header strip. */}
            <div
              className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 px-4"
              style={{ height: EMBED_HEADER_MASK, backgroundImage: "var(--gradient-night)" }}
            >
              <div
                className="flex size-9 shrink-0 items-center justify-center rounded-xl text-white shadow-glow"
                style={{ backgroundImage: "var(--gradient-brand)" }}
              >
                <Trophy className="size-5" />
              </div>
              <span className="font-display text-lg font-bold tracking-tight text-white">
                Focus <span className="text-primary">World Cup</span> Live
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex aspect-video w-full flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-surface p-6 text-center">
          <Tv className="size-10 text-muted-foreground" />
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">
            No live stream is set right now. An admin can add one from the Admin page.
          </p>
        </div>
      )}
    </div>
  );
}
