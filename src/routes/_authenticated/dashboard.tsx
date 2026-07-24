import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  formatNPT,
  formatNPTDate,
  formatNPR,
  formatNPTFull,
  isBetLocked,
  isTournamentStarted,
  TOURNAMENT_START_UTC,
} from "@/lib/time";
import { Trophy, Handshake, ArrowUpRight, Flame, CalendarClock } from "lucide-react";
import { MatchHighlights } from "@/components/MatchHighlights";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · Focus World Cup Pool" }] }),
  component: Dashboard,
});

const ENTRY_FEE = 1000;
const MAX_PICKS = 3;

type LeaderboardPick = {
  bet_id: string;
  team_id: string;
  team_name: string;
  team_code: string;
  team_flag_emoji: string;
  fifa_rank: number | null;
  points: number;
  placed_at: string;
};

function Dashboard() {
  const { user } = Route.useRouteContext();

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
        .gte("kickoff_utc", since)
        .neq("status", "finished")
        .order("kickoff_utc", { ascending: true })
        .limit(6);
      return data ?? [];
    },
  });

  const myPicks = useQuery({
    queryKey: ["my-picks", user.id],
    queryFn: async () =>
      (
        await supabase
          .from("bets")
          .select("*, team:teams(*)")
          .eq("user_id", user.id)
          .order("placed_at", { ascending: true })
      ).data ?? [],
  });

  const betCount = useQuery({
    queryKey: ["bet-count"],
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("get_total_bet_count");
      return (data as number | null) ?? 0;
    },
  });

  const leaderboard = useQuery({
    queryKey: ["leaderboard", "top"],
    refetchInterval: 60_000, // live: standings update as results come in
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("leaderboard_entries")
        .select("*")
        .gt("pick_count", 0)
        .order("points", { ascending: false })
        .order("confirmed_at", { ascending: true })
        .limit(5);
      return (data ?? []) as Array<{
        user_id: string;
        points: number;
        confirmed_at: string;
        display_name: string | null;
        picks: LeaderboardPick[];
      }>;
    },
  });

  // Once the Final is played, the World Cup champion + the pool winners (everyone
  // who backed that team) headline the dashboard.
  const championQ = useQuery({
    queryKey: ["champion"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("matches")
        .select(
          "status, winner_team_id, win:teams!matches_winner_team_id_fkey(code,name,flag_emoji)",
        )
        .eq("stage", "final")
        .maybeSingle();
      if (!data || data.status !== "finished" || !data.winner_team_id) return null;
      return (data.win ?? null) as { code: string; name: string; flag_emoji: string } | null;
    },
  });

  const winnersQ = useQuery({
    queryKey: ["pool-winners"],
    enabled: !!championQ.data,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("leaderboard_entries")
        .select("user_id, display_name, points, picks")
        .gt("pick_count", 0);
      return (data ?? []) as Array<{
        user_id: string;
        display_name: string | null;
        points: number;
        picks: LeaderboardPick[];
      }>;
    },
  });

  const champion = championQ.data ?? null;
  const winners = champion
    ? (winnersQ.data ?? [])
        .filter((e) => (e.picks ?? []).some((p) => p.team_code === champion.code))
        .sort((a, b) => b.points - a.points)
    : [];

  const pot = (betCount.data ?? 0) * ENTRY_FEE;

  return (
    <div className="space-y-12">
      {/* What's next: English Premier League teaser. */}
      <div
        className="relative overflow-hidden rounded-3xl border-2 border-[#e90052]/40 p-8 text-center text-white shadow-glow"
        style={{ background: "linear-gradient(135deg,#37003c 0%,#3d195b 45%,#7b1fa2 100%)" }}
      >
        <span className="inline-flex items-center gap-2 rounded-full bg-[#e90052] px-4 py-1 text-[11px] font-bold uppercase tracking-[0.25em] text-white">
          ⚽ Coming soon
        </span>
        <h2 className="mt-4 font-display text-4xl font-bold leading-tight md:text-5xl">
          English Premier League
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-slate-200">
          The Focus Pool is coming back for the Premier League 🏴󠁧󠁢󠁥󠁮󠁗󠁿 — same game you love, a
          brand-new competition. Get ready to back your clubs and go again.
        </p>
        <span className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-xs font-bold">
          Picks open soon · stay tuned
        </span>
      </div>

      {champion && (
        <div
          className="relative overflow-hidden rounded-3xl border-2 border-primary/50 p-8 text-center text-white shadow-glow"
          style={{ backgroundImage: "var(--gradient-night)" }}
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-4 py-1 text-[11px] font-bold uppercase tracking-[0.25em] text-primary">
            <Trophy className="size-3.5" /> World Cup 2026 Champions
          </span>
          <div className="mt-5 text-7xl leading-none">{champion.flag_emoji}</div>
          <h2 className="mt-3 font-display text-4xl font-bold md:text-5xl">{champion.name}</h2>
          <p className="mt-1 text-sm text-slate-300">are champions of the world 🏆</p>

          {winners.length > 0 && (
            <div className="mx-auto mt-7 max-w-2xl rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-300">
                  Pool winners — backed {champion.name}
                </p>
                <span className="inline-flex items-center gap-1 rounded-full bg-pitch/20 px-2.5 py-0.5 text-[11px] font-bold text-pitch">
                  ✓ All winners paid
                </span>
              </div>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {winners.map((w) => (
                  <span
                    key={w.user_id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm font-bold"
                  >
                    {champion.flag_emoji} {w.display_name ?? "Player"}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-slate-400">
                {winners.length} winner{winners.length === 1 ? "" : "s"} · prize pool split equally
                · paid out in full
              </p>
            </div>
          )}
        </div>
      )}

      {!isTournamentStarted() && (
        <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4 text-sm">
          <CalendarClock className="size-5 text-primary" />
          <p>
            <strong>Tournament begins {formatNPTFull(TOURNAMENT_START_UTC)}.</strong> No matches
            have been played yet — scores and standings will update live as results come in.
          </p>
        </div>
      )}
      {/* Hero + side bets */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div
          className="relative col-span-1 overflow-hidden rounded-3xl p-8 text-white lg:col-span-2"
          style={{ background: "var(--gradient-night)" }}
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-accent/20 px-3 py-1 text-xs font-bold uppercase tracking-widest text-accent">
            <Flame className="size-3" /> 2026 World Cup
          </span>
          <h1 className="mt-4 font-display text-4xl font-bold leading-tight md:text-5xl">
            The Triple-Host Spectacle.
          </h1>
          <p className="mt-3 max-w-md text-sm text-slate-300">
            16 stadiums across Canada, Mexico & USA. Entry locked at Rs. {formatNPR(ENTRY_FEE)}.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/bet"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition hover:scale-105"
            >
              {isBetLocked()
                ? (myPicks.data?.length ?? 0) > 0
                  ? "View your teams"
                  : "View teams"
                : (myPicks.data?.length ?? 0) > 0
                  ? "Manage your picks"
                  : "Pick your teams"}{" "}
              <ArrowUpRight className="size-4" />
            </Link>
            <Link
              to="/bracket"
              className="rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-bold backdrop-blur-sm transition hover:bg-white/10"
            >
              View bracket
            </Link>
          </div>

          <div className="mt-8 grid grid-cols-3 gap-4 border-t border-white/10 pt-6 text-xs">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400">Your entry</p>
              <p className="font-display text-2xl font-bold">
                Rs. {formatNPR((myPicks.data?.length ?? 0) * ENTRY_FEE)}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-400">
                {myPicks.data?.length ?? 0}/{MAX_PICKS} picks
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400">Your picks</p>
              <p className="font-display text-2xl font-bold">
                {(myPicks.data ?? []).map((p) => p.team?.flag_emoji).join(" ") || "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400">Prize pot</p>
              <p className="font-display text-2xl font-bold text-accent">Rs. {formatNPR(pot)}</p>
              <p className="mt-0.5 text-[10px] text-slate-400">
                Whole pool · {betCount.data ?? 0} pick{(betCount.data ?? 0) === 1 ? "" : "s"}
              </p>
            </div>
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
              Challenge a friend on any knockout game
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

      {/* Match Center */}
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

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {matches.data?.map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
          {!matches.isLoading && matches.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">No matches scheduled yet.</p>
          )}
        </div>
      </section>

      {/* Leaderboard preview */}
      <section className="grid gap-8 lg:grid-cols-2">
        <div className="rounded-3xl border border-border bg-surface p-8 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold">Pool Standings</h2>
            <Link
              to="/leaderboard"
              className="text-xs font-bold uppercase tracking-widest text-primary"
            >
              View all →
            </Link>
          </div>
          <div className="mt-6 space-y-3">
            {leaderboard.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No bets yet. Be the first to back a team!
              </p>
            )}
            {leaderboard.data?.map((row, i) => (
              <div
                key={row.user_id}
                className="flex items-center justify-between rounded-xl border border-border bg-background p-4"
              >
                <div className="flex items-center gap-4">
                  <span className="font-display text-lg font-bold text-primary">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p className="text-sm font-bold">{row.display_name ?? "Player"}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {(row.picks ?? [])
                        .map((p) => `${p.team_flag_emoji} ${p.team_code}`)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="block font-bold">{row.points} pts</span>
                  <span className="text-[10px] uppercase tracking-tighter text-muted-foreground">
                    {row.confirmed_at ? new Date(row.confirmed_at).toLocaleDateString() : "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-primary/20 bg-primary/5 p-8">
          <div className="flex items-center gap-2">
            <Trophy className="size-5 text-primary" />
            <h2 className="font-display text-xl font-bold text-primary">Pool rules</h2>
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            How it works
          </p>
          <dl className="mt-4 space-y-4 text-sm">
            <div>
              <dt className="font-bold">Entry fee</dt>
              <dd className="text-muted-foreground">
                Rs. {formatNPR(ENTRY_FEE)} per team you select.
              </dd>
            </div>
            <div>
              <dt className="font-bold">Team limit</dt>
              <dd className="text-muted-foreground">
                You may select a maximum of {MAX_PICKS} teams. Your deposit is Rs.{" "}
                {formatNPR(ENTRY_FEE)} × the number of teams you back:
              </dd>
              <ul className="mt-2 space-y-1">
                {Array.from({ length: MAX_PICKS }, (_, i) => i + 1).map((n) => (
                  <li
                    key={n}
                    className="flex items-center justify-between rounded-lg bg-background px-3 py-1.5 text-xs"
                  >
                    <span className="font-medium">
                      {n} team{n === 1 ? "" : "s"}
                    </span>
                    <span className="font-bold text-primary">Rs. {formatNPR(ENTRY_FEE * n)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <dt className="font-bold">The prize pool</dt>
              <dd className="text-muted-foreground">
                All collected entry fees for a specific team are combined to form that team's total
                prize pool.
              </dd>
            </div>
            <div>
              <dt className="font-bold">The payout</dt>
              <dd className="text-muted-foreground">
                If your selected team wins the World Cup, you win! If two or more participants
                selected the same winning team, that team's total accumulated prize pool is split
                equally among the winners.
              </dd>
            </div>
          </dl>
        </div>
      </section>
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
          {match.stage === "group" ? `Group ${match.group_name}` : match.stage.toUpperCase()}
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
      <div className="grid size-12 place-items-center rounded-lg bg-secondary text-2xl">
        {team?.flag_emoji ?? "🏳️"}
      </div>
      <span className="text-xs font-bold">{team?.name ?? "TBD"}</span>
    </div>
  );
}
