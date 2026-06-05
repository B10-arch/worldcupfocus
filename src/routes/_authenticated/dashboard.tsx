import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatNPT, formatNPTDate, formatNPR } from "@/lib/time";
import { Trophy, Sparkles, ArrowUpRight, Flame } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · Uni-Corn Pool" }] }),
  component: Dashboard,
});

const ENTRY_FEE = 1000;

function Dashboard() {
  const { user } = Route.useRouteContext();

  const matches = useQuery({
    queryKey: ["matches", "upcoming"],
    queryFn: async () => {
      const { data } = await supabase
        .from("matches")
        .select("*, team_a:teams!matches_team_a_id_fkey(*), team_b:teams!matches_team_b_id_fkey(*)")
        .order("kickoff_utc", { ascending: true })
        .limit(6);
      return data ?? [];
    },
  });

  const trivia = useQuery({
    queryKey: ["trivia", "today"],
    queryFn: async () => {
      const { count } = await supabase.from("trivia_facts").select("*", { count: "exact", head: true });
      const total = count ?? 1;
      const idx = Math.floor(Date.now() / 86400000) % total;
      const { data } = await supabase
        .from("trivia_facts")
        .select("*")
        .order("created_at")
        .range(idx, idx);
      return data?.[0];
    },
  });

  const myBet = useQuery({
    queryKey: ["my-bet", user.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("bets")
        .select("*, team:teams(*)")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
  });

  const betCount = useQuery({
    queryKey: ["bet-count"],
    queryFn: async () => {
      const { count } = await supabase.from("bets").select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const quizProgress = useQuery({
    queryKey: ["quiz-progress", user.id],
    queryFn: async () => {
      const [{ count: total }, { count: done }] = await Promise.all([
        supabase.from("quiz_questions").select("*", { count: "exact", head: true }),
        supabase
          .from("quiz_progress")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("correct", true),
      ]);
      return { total: total ?? 0, done: done ?? 0 };
    },
  });

  const leaderboard = useQuery({
    queryKey: ["leaderboard", "top"],
    queryFn: async () => {
      const { data: bets } = await supabase
        .from("bets")
        .select("*, team:teams(*)")
        .order("points", { ascending: false })
        .order("placed_at", { ascending: true })
        .limit(5);
      if (!bets) return [];
      const ids = bets.map((b) => b.user_id);
      const { data: profiles } = await supabase.from("profiles").select("*").in("id", ids);
      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
      return bets.map((b) => ({ ...b, profile: profileMap.get(b.user_id) }));
    },
  });

  const pot = (betCount.data ?? 0) * ENTRY_FEE;

  return (
    <div className="space-y-12">
      {/* Hero + trivia */}
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
              {myBet.data ? "Change your team" : "Back your team"} <ArrowUpRight className="size-4" />
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
              <p className="text-[10px] uppercase tracking-widest text-slate-400">Prize pot</p>
              <p className="font-display text-2xl font-bold text-accent">Rs. {formatNPR(pot)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400">Players</p>
              <p className="font-display text-2xl font-bold">{betCount.data ?? 0}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400">Your bet</p>
              <p className="font-display text-2xl font-bold">
                {myBet.data?.team ? `${myBet.data.team.flag_emoji}` : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Daily trivia */}
        <div className="flex flex-col justify-between rounded-3xl border border-border bg-surface p-8 shadow-card">
          <div>
            <div className="flex items-center gap-2 text-magenta">
              <Sparkles className="size-3" />
              <span className="text-xs font-bold uppercase tracking-widest">Daily Trivia Fact</span>
            </div>
            <h3 className="mt-4 font-display text-xl font-bold leading-tight">
              {trivia.data?.title ?? "Loading…"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">{trivia.data?.body}</p>
          </div>
          <div className="mt-6">
            <div className="mb-2 flex justify-between text-xs font-bold uppercase">
              <span className="text-muted-foreground">Quiz Progress</span>
              <span className="text-primary">
                {quizProgress.data?.done ?? 0}/{quizProgress.data?.total ?? 100}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{
                  width: `${quizProgress.data && quizProgress.data.total > 0 ? (quizProgress.data.done / quizProgress.data.total) * 100 : 0}%`,
                }}
              />
            </div>
            <Link
              to="/quiz"
              className="mt-4 inline-block w-full rounded-xl bg-secondary py-3 text-center text-sm font-bold text-primary transition hover:bg-primary/5"
            >
              Play trivia →
            </Link>
          </div>
        </div>
      </div>

      {/* Match Center */}
      <section>
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold">Match Center</h2>
            <p className="text-sm uppercase text-muted-foreground">All times in Nepal Standard Time (NPT)</p>
          </div>
          <span className="rounded-lg bg-pitch/10 px-3 py-1 text-xs font-bold text-pitch">Live tracking</span>
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
            <Link to="/leaderboard" className="text-xs font-bold uppercase tracking-widest text-primary">
              View all →
            </Link>
          </div>
          <div className="mt-6 space-y-3">
            {leaderboard.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">No bets yet. Be the first to back a team!</p>
            )}
            {leaderboard.data?.map((row, i) => (
              <div
                key={row.id}
                className="flex items-center justify-between rounded-xl border border-border bg-background p-4"
              >
                <div className="flex items-center gap-4">
                  <span className="font-display text-lg font-bold text-primary">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p className="text-sm font-bold">{row.profile?.display_name ?? "Player"}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Backed: {row.team?.flag_emoji} {row.team?.name}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="block font-bold">{row.points} pts</span>
                  <span className="text-[10px] uppercase tracking-tighter text-muted-foreground">
                    {new Date(row.placed_at).toLocaleDateString()}
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
          <ul className="mt-6 space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="font-display text-primary">01</span>
              Flat entry of <strong>Rs. {formatNPR(ENTRY_FEE)}</strong> backs your chosen team.
            </li>
            <li className="flex gap-3">
              <span className="font-display text-primary">02</span>
              Pick the same team as someone else? You <strong>split the pot equally</strong>.
            </li>
            <li className="flex gap-3">
              <span className="font-display text-primary">03</span>
              Back a team outside FIFA top 15? Get the <strong>Underdog multiplier</strong> on points.
            </li>
            <li className="flex gap-3">
              <span className="font-display text-primary">04</span>
              Tied on points at the end? <strong>Earliest bet wins</strong> the tiebreaker.
            </li>
          </ul>
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
          Group {match.group_name} · {match.venue}
        </span>
        <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold">
          {formatNPTDate(match.kickoff_utc)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <TeamSide team={match.team_a} score={match.score_a} />
        <div className="flex flex-col items-center">
          {live ? (
            <span className="font-display text-xl font-bold text-magenta">LIVE</span>
          ) : finished ? (
            <span className="font-display text-xl font-bold">FT</span>
          ) : (
            <>
              <span className="font-display text-xl font-bold">{formatNPT(match.kickoff_utc)}</span>
              <span className="text-[10px] font-bold uppercase text-primary">NPT</span>
            </>
          )}
        </div>
        <TeamSide team={match.team_b} score={match.score_b} reverse />
      </div>
      {(live || finished) && (
        <div className="mt-6 text-center font-display text-xl font-bold">
          {match.score_a ?? 0} — {match.score_b ?? 0}
        </div>
      )}
    </div>
  );
}

function TeamSide({ team, score: _score, reverse = false }: { team: any; score: number | null; reverse?: boolean }) {
  return (
    <div className={`flex flex-1 flex-col items-center gap-2 ${reverse ? "" : ""}`}>
      <div className="grid size-12 place-items-center rounded-lg bg-secondary text-2xl">{team?.flag_emoji}</div>
      <span className="text-xs font-bold">{team?.name}</span>
    </div>
  );
}
