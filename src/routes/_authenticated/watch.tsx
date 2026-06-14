import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tv, Trophy } from "lucide-react";
import { useLiveLineups } from "@/lib/live-lineups";
import { LineupPanel } from "@/components/LiveLineups";

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

  // Live lineups for the in-progress match (ESPN, no key). Null when nothing is live.
  const ll = useLiveLineups().data ?? null;

  const playerCard = (
    <div className="overflow-hidden rounded-3xl border border-border bg-night shadow-card">
      {/* Branded header sits ABOVE the player so it never covers the
          broadcast's own scoreboard / match clock at the top of the video. */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ backgroundImage: "var(--gradient-night)" }}
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
      <div className="relative aspect-video">
        <iframe
          src={url}
          title={title || "Live match"}
          className="absolute inset-0 size-full"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-display text-4xl font-bold">
          <Tv className="size-8 text-primary" /> Watch Live
        </h1>
        <p className="mt-2 text-muted-foreground">{title || "Live match stream."}</p>
      </header>

      {url ? (
        ll ? (
          // Keep the player at full size. Lineups flank it only when the screen is
          // wide enough to fit them in the outer margins (≥1800px, full-bleed);
          // otherwise they wrap below the player so it never shrinks.
          <div className="flex flex-wrap items-start justify-center gap-4 min-[1800px]:mx-[calc(50%-50vw)] min-[1800px]:flex-nowrap min-[1800px]:px-6">
            <div className="order-1 w-full max-w-7xl min-[1800px]:order-2 min-[1800px]:w-auto min-[1800px]:flex-1">
              {playerCard}
            </div>
            <LineupPanel
              team={ll.home}
              clock={ll.clock}
              className="order-2 w-full sm:w-[calc(50%-0.5rem)] min-[1800px]:order-1 min-[1800px]:w-56 min-[1800px]:shrink-0"
            />
            <LineupPanel
              team={ll.away}
              clock={ll.clock}
              className="order-3 w-full sm:w-[calc(50%-0.5rem)] min-[1800px]:order-3 min-[1800px]:w-56 min-[1800px]:shrink-0"
            />
          </div>
        ) : (
          playerCard
        )
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
