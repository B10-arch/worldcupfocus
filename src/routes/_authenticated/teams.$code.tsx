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

  const { data: groupmates } = useQuery({
    queryKey: ["groupmates", team?.group_name, team?.id],
    enabled: !!team?.group_name && !!team?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("*")
        .eq("group_name", team!.group_name!)
        .neq("id", team!.id);
      return data ?? [];
    },
  });

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!team) throw notFound();

  const underdog = team.fifa_rank != null && team.fifa_rank > 15;
  const squadList = (team.squad ?? []) as string[];

  return (
    <div className="space-y-10">
      <Link
        to="/teams"
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground"
      >
        <ArrowLeft className="size-3" /> All teams
      </Link>

      <header className="rounded-3xl border border-border bg-surface p-8 shadow-card">
        <div className="flex flex-wrap items-center gap-6">
          <div className="grid size-24 place-items-center rounded-2xl bg-secondary text-7xl">
            {team.flag_emoji}
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Group {team.group_name}
            </p>
            <h1 className="font-display text-5xl font-bold">{team.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manager: <strong className="text-foreground">{team.coach ?? "TBC"}</strong> · FIFA Rank #
              {team.fifa_rank ?? "—"}
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
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              World Cup history
            </p>
            <p className="mt-1 text-sm font-semibold">{team.wc_form ?? "TBC"}</p>
          </div>
          <div className="rounded-2xl bg-muted p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Active squad
            </p>
            <p className="mt-1 text-sm">
              {squadList.length > 0 ? squadList.join(" · ") : "Squad list to be confirmed by federation."}
            </p>
          </div>
        </div>
      </header>

      {/* Group opponents / head-to-head */}
      <section>
        <h2 className="mb-4 font-display text-xl font-bold">Group {team.group_name} opponents</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {(groupmates ?? []).map((g) => (
            <Link
              key={g.id}
              to="/teams/$code"
              params={{ code: g.code }}
              className="rounded-2xl border border-border bg-surface p-4 shadow-card transition hover:border-primary/50"
            >
              <div className="flex items-center gap-3">
                <span className="text-3xl">{g.flag_emoji}</span>
                <div className="flex-1">
                  <p className="font-bold">{g.name}</p>
                  <p className="text-[11px] text-muted-foreground">FIFA #{g.fifa_rank}</p>
                </div>
              </div>
              <p className="mt-3 text-[11px] uppercase tracking-widest text-muted-foreground">
                Head-to-head: TBC
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-display text-xl font-bold">Fixtures</h2>
        <div className="space-y-2">
          {matches?.map((m) => {
            const opponent = m.team_a_id === team.id ? m.team_b : m.team_a;
            const played = m.status === "finished";
            return (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-xl border border-border bg-surface p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{opponent?.flag_emoji ?? "🏳️"}</span>
                  <div>
                    <p className="font-semibold">vs {opponent?.name ?? "TBD"}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.time_tbc
                        ? "Time TBC"
                        : `${formatNPTDate(m.kickoff_utc)} · ${formatNPT(m.kickoff_utc)} NPT`}
                    </p>
                  </div>
                </div>
                {played ? (
                  <span className="font-mono font-bold">
                    {m.score_a}–{m.score_b}
                  </span>
                ) : m.status === "live" ? (
                  <span className="rounded-full bg-magenta/10 px-2 py-0.5 text-xs font-bold text-magenta">
                    LIVE
                  </span>
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
