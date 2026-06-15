import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatNPTFull } from "@/lib/time";
import { Tv, Trophy } from "lucide-react";

// Height of the branded bar that overlays (masks) the provider's own top nav —
// e.g. the "Movish" logo + menu — so only our branding shows.
const NAV_MASK = "4rem";
// A scheduled match whose kickoff passed within this window is treated as on-air
// (covers any lag before the sync flips its status to "live").
const MATCH_WINDOW_MS = 2.5 * 60 * 60 * 1000;

export const Route = createFileRoute("/_authenticated/watch")({
  head: () => ({ meta: [{ title: "Watch Live · Focus World Cup Pool" }] }),
  component: WatchPage,
});

type LiveStream = { embed_url: string; title: string };
type WatchMatch = {
  status: string;
  kickoff_utc: string;
  team_a: { name: string | null; flag_emoji: string | null } | null;
  team_b: { name: string | null; flag_emoji: string | null } | null;
};

function WatchPage() {
  const { data: stream } = useQuery({
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

  // Upcoming/live matches — drives whether we show the stream or a countdown.
  const { data: matches } = useQuery({
    queryKey: ["watch-matches"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("matches")
        .select(
          "status, kickoff_utc, team_a:teams!matches_team_a_id_fkey(name, flag_emoji), team_b:teams!matches_team_b_id_fkey(name, flag_emoji)",
        )
        .neq("status", "finished")
        .order("kickoff_utc", { ascending: true })
        .limit(6);
      return (data ?? []) as WatchMatch[];
    },
  });

  const url = (stream?.embed_url ?? "").trim();
  const title = (stream?.title ?? "").trim();
  // embed_url may hold a primary + backup feed; viewers can switch between them.
  // Split on whitespace and on each "http(s)://" boundary so feeds parse cleanly
  // even if two URLs ended up mashed together.
  const feeds = [
    ...new Set(
      url
        .split(/\s+|(?=https?:\/\/)/)
        .map((s) => s.trim())
        .filter((s) => /^https?:\/\//.test(s)),
    ),
  ];
  const [feedIdx, setFeedIdx] = useState(0);
  const activeUrl = feeds[feedIdx] ?? feeds[0] ?? "";

  const now = Date.now();
  // A match is "on air" if it's live, or it's a scheduled match whose kickoff
  // just passed (sync may lag flipping it to live).
  const onAir = (matches ?? []).find(
    (m) =>
      m.status === "live" ||
      (m.status === "scheduled" &&
        Date.parse(m.kickoff_utc) <= now &&
        now - Date.parse(m.kickoff_utc) < MATCH_WINDOW_MS),
  );
  const next = (matches ?? []).find(
    (m) => m.status === "scheduled" && Date.parse(m.kickoff_utc) > now,
  );

  const playerCard = (
    <div className="overflow-hidden rounded-3xl border border-border bg-night shadow-card">
      <div className="relative aspect-video">
        <iframe
          key={activeUrl}
          src={activeUrl}
          title={title || "Live match"}
          className="absolute inset-0 size-full"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
        {/* Branded bar overlays the provider's top nav (e.g. the Movish logo +
            menu) so only our branding is visible. */}
        <div
          className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 px-4"
          style={{ height: NAV_MASK, backgroundImage: "var(--gradient-night)" }}
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
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-display text-4xl font-bold">
          <Tv className="size-8 text-primary" /> Watch Live
        </h1>
        <p className="mt-2 text-muted-foreground">
          {onAir && url
            ? title || "Live match stream."
            : "Live stream shows here when a match is on."}
        </p>
      </header>

      {onAir && url ? (
        <div className="space-y-3">
          {playerCard}
          {feeds.length > 1 && (
            <p className="text-center text-sm text-muted-foreground">
              Stream not loading?{" "}
              <button
                onClick={() => setFeedIdx((i) => (i + 1) % feeds.length)}
                className="font-bold text-primary hover:underline"
              >
                Switch feed ({feedIdx + 1}/{feeds.length})
              </button>
            </p>
          )}
        </div>
      ) : next ? (
        <CountdownCard match={next} />
      ) : onAir && !url ? (
        <Placeholder text="A match is on, but no stream has been set. An admin can add one from the Admin page." />
      ) : (
        <Placeholder text="No upcoming matches. Check back when the next fixture is scheduled." />
      )}
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="flex aspect-video w-full flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-surface p-6 text-center">
      <Tv className="size-10 text-muted-foreground" />
      <p className="mt-3 max-w-sm text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

/** "FIFA World Cup 2026" + a live ticking countdown to the next match. */
function CountdownCard({ match }: { match: WatchMatch }) {
  const target = Date.parse(match.kickoff_utc);
  const a = match.team_a;
  const b = match.team_b;
  return (
    <div
      className="overflow-hidden rounded-3xl border border-border p-8 text-center text-white shadow-card md:p-12"
      style={{ backgroundImage: "var(--gradient-night)" }}
    >
      <span className="inline-flex items-center gap-2 rounded-full bg-magenta/15 px-3 py-1 text-xs font-bold uppercase tracking-widest text-magenta">
        ● No live match right now
      </span>
      <h2 className="mt-5 flex items-center justify-center gap-3 font-display text-4xl font-bold leading-tight md:text-5xl">
        <Trophy className="size-9 text-amber-pop" />
        FIFA <span className="text-primary">World Cup</span> 2026
      </h2>
      <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
        Next match kicks off in
      </p>
      {(a || b) && (
        <p className="mt-2 font-display text-xl font-bold md:text-2xl">
          {a?.flag_emoji} {a?.name ?? "TBD"} <span className="text-slate-400">vs</span>{" "}
          {b?.name ?? "TBD"} {b?.flag_emoji}
        </p>
      )}
      <Countdown target={target} />
      <p className="mt-6 text-xs text-slate-400">{formatNPTFull(match.kickoff_utc)}</p>
    </div>
  );
}

function Countdown({ target }: { target: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, target - now);
  if (diff <= 0) {
    return <p className="mt-6 font-display text-2xl font-bold text-accent">Kicking off…</p>;
  }
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor(diff / 3_600_000) % 24;
  const mins = Math.floor(diff / 60_000) % 60;
  const secs = Math.floor(diff / 1_000) % 60;
  const units: Array<[number, string]> = [
    [days, "Days"],
    [hours, "Hours"],
    [mins, "Mins"],
    [secs, "Secs"],
  ];
  return (
    <div className="mt-6 flex flex-wrap justify-center gap-3">
      {units.map(([v, label]) => (
        <div key={label} className="min-w-[4.5rem] rounded-2xl bg-white/10 px-4 py-3">
          <div className="font-display text-3xl font-bold tabular-nums md:text-4xl">
            {String(v).padStart(2, "0")}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-slate-400">{label}</div>
        </div>
      ))}
    </div>
  );
}
