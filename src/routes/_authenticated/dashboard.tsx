import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatNPT, formatNPTDate } from "@/lib/time";
import { Handshake, ArrowUpRight, Flame } from "lucide-react";
import { MatchHighlights } from "@/components/MatchHighlights";
import { Crest } from "@/components/Crest";
import { Highlights } from "@/components/Highlights";
import { TransferNews } from "@/components/TransferNews";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · Focus Premier League Pool" }] }),
  component: Dashboard,
});

function Dashboard() {
  const matches = useQuery({
    queryKey: ["matches", "upcoming"],
    refetchInterval: 60_000, // live: pull fresh scores/status every 60s
    queryFn: async () => {
      // Current slate: live + upcoming only (not old, already-played games).
      // kickoff within the last ~3h keeps an in-progress match; not "finished"
      // drops games that have ended.
      const since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("matches")
        .select("*, team_a:teams!matches_team_a_id_fkey(*), team_b:teams!matches_team_b_id_fkey(*)")
        .eq("stage", "league")
        .gte("kickoff_utc", since)
        .neq("status", "finished")
        .order("kickoff_utc", { ascending: true })
        .limit(6);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-12">
      {/* New season: Premier League 2026/27 is here. */}
      <div
        className="relative overflow-hidden rounded-3xl border-2 border-[#e90052]/40 p-8 text-center text-white shadow-glow"
        style={{ background: "linear-gradient(135deg,#37003c 0%,#3d195b 45%,#7b1fa2 100%)" }}
      >
        <span className="inline-flex items-center gap-2 rounded-full bg-[#e90052] px-4 py-1 text-[11px] font-bold uppercase tracking-[0.25em] text-white">
          ⚽ New season
        </span>
        <h2 className="mt-4 font-display text-4xl font-bold leading-tight md:text-5xl">
          Premier League 2026/27
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-slate-200">
          The Focus Pool is back for the Premier League 🏴󠁧󠁢󠁥󠁮󠁗󠁿 — 20 clubs, 38 gameweeks. This
          season it&apos;s all friendly side bets: challenge your mates on every match.
        </p>
        <span className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-xs font-bold">
          Season kicks off Sat 22 Aug
        </span>
      </div>

      {/* Hero + side bets */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div
          className="relative col-span-1 overflow-hidden rounded-3xl p-8 text-white lg:col-span-2"
          style={{ background: "var(--gradient-night)" }}
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-accent/20 px-3 py-1 text-xs font-bold uppercase tracking-widest text-accent">
            <Flame className="size-3" /> Premier League 2026/27
          </span>
          <h1 className="mt-4 font-display text-4xl font-bold leading-tight md:text-5xl">
            Bet Your Mates. Settle Up.
          </h1>
          <p className="mt-3 max-w-md text-sm text-slate-300">
            No entry fee, no prize pot — just friendly side bets. Back a club on any game, name your
            stake (money or a dare), someone takes the other side, and you settle up once it&apos;s
            played.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/friendly"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition hover:scale-105"
            >
              Make a side bet <ArrowUpRight className="size-4" />
            </Link>
            <Link
              to="/matches"
              className="rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-bold backdrop-blur-sm transition hover:bg-white/10"
            >
              Fixtures
            </Link>
            <Link
              to="/teams"
              className="rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-bold backdrop-blur-sm transition hover:bg-white/10"
            >
              Clubs &amp; table
            </Link>
          </div>
        </div>

        {/* Friendly side bets */}
        <div className="flex flex-col justify-between rounded-3xl border border-border bg-surface p-8 shadow-card">
          <div>
            <div className="flex items-center gap-2 text-magenta">
              <Handshake className="size-3" />
              <span className="text-xs font-bold uppercase tracking-widest">
                Friendly Side Bets
              </span>
            </div>
            <h3 className="mt-4 font-display text-xl font-bold leading-tight">
              Challenge a friend on any Premier League game
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Pick a team and name your stake — money or a dare. Someone takes the other side and it
              locks in. Offer as many as you like, then settle up per game once it&apos;s played.
            </p>
          </div>
          <div className="mt-6">
            <Link
              to="/friendly"
              className="inline-block w-full rounded-xl bg-secondary py-3 text-center text-sm font-bold text-primary transition hover:bg-primary/5"
            >
              Make a side bet →
            </Link>
          </div>
        </div>
      </div>

      {/* Match Center + Transfer News side panel */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section>
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 className="font-display text-2xl font-bold">Match Center</h2>
              <p className="text-sm uppercase text-muted-foreground">
                All times in Nepal Standard Time (NPT)
              </p>
            </div>
            <span className="rounded-lg bg-pitch/10 px-3 py-1 text-xs font-bold text-pitch">
              Live tracking
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {matches.data?.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
            {!matches.isLoading && matches.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">No matches scheduled yet.</p>
            )}
          </div>
        </section>

        <TransferNews />
      </div>

      <Highlights />
    </div>
  );
}

function MatchCard({ match }: { match: any }) {
  const live = match.status === "live";
  const finished = match.status === "finished";
  return (
    <div className="group relative rounded-2xl border border-border bg-surface p-6 shadow-card transition hover:shadow-lg">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {match.stage === "league"
            ? `Gameweek ${String(match.group_name ?? "").replace(/\D/g, "") || match.group_name}`
            : match.stage === "group"
              ? `Group ${match.group_name}`
              : String(match.stage).toUpperCase()}
          {match.venue ? ` · ${match.venue}` : ""}
        </span>
        <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold">
          {match.time_tbc ? "TBC" : formatNPTDate(match.kickoff_utc)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <TeamSide team={match.team_a} />
        <div className="flex flex-col items-center">
          {live ? (
            <span className="font-display text-xl font-bold text-magenta">LIVE</span>
          ) : finished ? (
            <span className="font-display text-xl font-bold">FT</span>
          ) : match.time_tbc ? (
            <>
              <span className="font-display text-base font-bold">vs</span>
              <span className="text-[10px] font-bold uppercase text-muted-foreground">
                Time TBC
              </span>
            </>
          ) : (
            <>
              <span className="font-display text-xl font-bold">{formatNPT(match.kickoff_utc)}</span>
              <span className="text-[10px] font-bold uppercase text-primary">NPT</span>
            </>
          )}
        </div>
        <TeamSide team={match.team_b} />
      </div>
      {(live || finished) && match.score_a != null && match.score_b != null && (
        <div className="mt-6 text-center font-display text-xl font-bold">
          {match.score_a} — {match.score_b}
        </div>
      )}
      {(finished || (match.highlights_url ?? "").trim()) && <MatchHighlights match={match} />}
    </div>
  );
}

function TeamSide({ team }: { team: any }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-2">
      <div className="grid size-12 place-items-center rounded-lg bg-secondary">
        <Crest src={team?.flag_emoji} size={34} />
      </div>
      <span className="text-xs font-bold">{team?.name ?? "TBD"}</span>
    </div>
  );
}
