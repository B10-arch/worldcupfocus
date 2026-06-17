import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatNPTFull } from "@/lib/time";
import { feedsForLiveMatch } from "@/lib/streams";
import { expandFeeds, type Server } from "@/lib/hely-streams";
import { Tv, Trophy } from "lucide-react";

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
  team_a: { name: string | null; flag_emoji: string | null; code: string | null } | null;
  team_b: { name: string | null; flag_emoji: string | null; code: string | null } | null;
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
          "status, kickoff_utc, team_a:teams!matches_team_a_id_fkey(name, flag_emoji, code), team_b:teams!matches_team_b_id_fkey(name, flag_emoji, code)",
        )
        .neq("status", "finished")
        .order("kickoff_utc", { ascending: true })
        .limit(6);
      return (data ?? []) as WatchMatch[];
    },
  });

  const url = (stream?.embed_url ?? "").trim();
  const title = (stream?.title ?? "").trim();

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

  // Feeds for the live match: its own link(s) keyed by team codes, plus the
  // default appended as a backup.
  const rawFeeds = onAir ? feedsForLiveMatch(url, onAir.team_a?.code, onAir.team_b?.code) : [];
  // Resolve helytvme match links into clean, video-only player URLs (one per
  // server). Non-helytvme links pass through unchanged.
  const expandQ = useQuery({
    queryKey: ["expand-feeds", rawFeeds],
    enabled: onAir != null && rawFeeds.length > 0,
    staleTime: 60_000,
    queryFn: () => expandFeeds(rawFeeds),
  });
  const servers: Server[] = expandQ.data?.length
    ? expandQ.data
    : rawFeeds.map((u) => ({ name: "Stream", url: u }));
  const [feedIdx, setFeedIdx] = useState(0);
  const activeUrl = servers[feedIdx]?.url ?? servers[0]?.url ?? "";

  const playerCard = (
    <div className="overflow-hidden rounded-3xl border border-border bg-night shadow-card">
      <div className="relative aspect-video">
        <iframe
          key={activeUrl}
          src={activeUrl}
          title={title || "Live match"}
          className="absolute inset-0 size-full"
          // Brave-style protection: the player can run scripts and play video,
          // but the sandbox withholds allow-popups and allow-top-navigation, so
          // its ad scripts can't open pop-ups or hijack/redirect the tab to
          // another (e.g. adult/malware) site when you click play.
          sandbox="allow-scripts allow-same-origin allow-presentation"
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
        <p className="mt-2 text-muted-foreground">
          {onAir && servers.length
            ? title || "Live match stream."
            : "Live stream shows here when a match is on."}
        </p>
      </header>

      {onAir && servers.length ? (
        <div className="space-y-3">
          {playerCard}
          {servers.length > 1 && (
            <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
              <p className="text-sm">
                <span className="font-bold text-foreground">📺 Stream not playing?</span>{" "}
                <span className="text-muted-foreground">
                  Give it 10–20 seconds to load first. If it still doesn&apos;t play, tap a
                  different server below — only some of these {servers.length} actually carry this
                  match live, so try a few (waiting 10–20s on each) until one plays. The highlighted
                  one is selected.
                </span>
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {servers.map((s, i) => (
                  <button
                    key={s.url}
                    onClick={() => setFeedIdx(i)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                      i === feedIdx
                        ? "bg-primary text-primary-foreground shadow-glow"
                        : "border border-border bg-background text-foreground hover:border-primary hover:bg-primary/5"
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : next ? (
        <CountdownCard match={next} />
      ) : onAir ? (
        <Placeholder text="This match is on, but no stream link is set for it. Add one in Admin → Live Stream." />
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
