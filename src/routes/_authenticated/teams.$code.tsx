import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatNPT, formatNPTDate } from "@/lib/time";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/teams/$code")({
  head: ({ params }) => ({ meta: [{ title: `${params.code} · Uni-Corn Pool` }] }),
  component: TeamDetail,
});

function TeamDetail() {
  const { code } = Route.useParams();

  const { data: team, isLoading } = useQuery({
    queryKey: ["team", code],
    queryFn: async () => {
      const { data } = await supabase.from("teams").select("*").eq("code", code).maybeSingle();
      return data;
    },
  });

  const { data: matches } = useQuery({
    queryKey: ["team-matches", team?.id],
    enabled: !!team?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("matches")
        .select("*, team_a:teams!matches_team_a_id_fkey(*), team_b:teams!matches_team_b_id_fkey(*)")
        .or(`team_a_id.eq.${team!.id},team_b_id.eq.${team!.id}`)
        .order("kickoff_utc");
      return data ?? [];
    },
  });

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!team) throw notFound();

  const underdog = team.fifa_rank != null && team.fifa_rank > 15;

  return (
    <div className="space-y-10">
      <Link to="/teams" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
        <ArrowLeft className="size-3" /> All teams
      </Link>

      <header className="rounded-3xl border border-border bg-surface p-8 shadow-card">
        <div className="flex flex-wrap items-center gap-6">
          <div className="grid size-24 place-items-center rounded-2xl bg-secondary text-7xl">{team.flag_emoji}</div>
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Group {team.group_name}</p>
            <h1 className="font-display text-5xl font-bold">{team.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manager: <strong className="text-foreground">{team.coach}</strong> · FIFA Rank #{team.fifa_rank}
            </p>
          </div>
          {underdog && (
            <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-bold uppercase tracking-widest text-amber-pop">
              Underdog multiplier
            </span>
          )}
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-muted p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">WC Form</p>
            <p className="mt-1 font-mono text-lg font-bold">{team.wc_form}</p>
          </div>
          <div className="rounded-2xl bg-muted p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Squad highlights</p>
            <p className="mt-1 text-sm font-semibold">{(team.squad ?? []).join(" · ")}</p>
          </div>
        </div>
      </header>

      <section>
        <h2 className="mb-4 font-display text-xl font-bold">Fixtures</h2>
        <div className="space-y-2">
          {matches?.map((m) => {
            const opponent = m.team_a_id === team.id ? m.team_b : m.team_a;
            return (
              <div key={m.id} className="flex items-center justify-between rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{opponent?.flag_emoji}</span>
                  <div>
                    <p className="font-semibold">vs {opponent?.name}</p>
                    <p className="text-xs text-muted-foreground">{formatNPTDate(m.kickoff_utc)} · {formatNPT(m.kickoff_utc)} NPT</p>
                  </div>
                </div>
                {m.status === "finished" ? (
                  <span className="font-mono font-bold">{m.score_a}–{m.score_b}</span>
                ) : m.status === "live" ? (
                  <span className="rounded-full bg-magenta/10 px-2 py-0.5 text-xs font-bold text-magenta">LIVE</span>
                ) : (
                  <span className="text-xs font-bold uppercase text-primary">Upcoming</span>
                )}
              </div>
            );
          })}
          {matches?.length === 0 && <p className="text-sm text-muted-foreground">No fixtures yet.</p>}
        </div>
      </section>
    </div>
  );
}
