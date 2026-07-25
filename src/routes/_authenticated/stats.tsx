import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Crest } from "@/components/Crest";
import { Goal, Handshake, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/stats")({
  head: () => ({ meta: [{ title: "Stats · Focus Premier League Pool" }] }),
  component: StatsPage,
});

type TeamLite = { name: string | null; code: string | null; flag_emoji: string | null };
type EventRow = { scorer: string; assist: string | null; kind: string; team: TeamLite | null };
type MatchRow = {
  team_a_id: string;
  team_b_id: string;
  score_a: number | null;
  score_b: number | null;
  team_a: TeamLite | null;
  team_b: TeamLite | null;
};

function StatsPage() {
  const eventsQ = useQuery({
    queryKey: ["match-events-all"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("match_events")
        .select("scorer, assist, kind, team:teams(name, code, flag_emoji)");
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
  });
  const errMsg = eventsQ.error ? String((eventsQ.error as any).message ?? "") : "";
  const notSetUp =
    eventsQ.isError && /match_events|schema cache|does not exist|relation/i.test(errMsg);

  const matchesQ = useQuery({
    queryKey: ["finished-league-matches"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("matches")
        .select(
          "team_a_id, team_b_id, score_a, score_b, team_a:teams!matches_team_a_id_fkey(name,code,flag_emoji), team_b:teams!matches_team_b_id_fkey(name,code,flag_emoji)",
        )
        .eq("stage", "league")
        .eq("status", "finished");
      return (data ?? []) as MatchRow[];
    },
  });

  // Top scorers (own goals don't count for the scorer).
  const scorers = new Map<string, { name: string; count: number; team: TeamLite | null }>();
  const assists = new Map<string, { name: string; count: number; team: TeamLite | null }>();
  for (const e of eventsQ.data ?? []) {
    if (e.kind !== "own_goal" && e.scorer) {
      const c = scorers.get(e.scorer) ?? { name: e.scorer, count: 0, team: e.team };
      c.count++;
      scorers.set(e.scorer, c);
    }
    if (e.assist) {
      const c = assists.get(e.assist) ?? { name: e.assist, count: 0, team: e.team };
      c.count++;
      assists.set(e.assist, c);
    }
  }
  const topScorers = [...scorers.values()].sort((a, b) => b.count - a.count).slice(0, 15);
  const topAssisters = [...assists.values()].sort((a, b) => b.count - a.count).slice(0, 15);

  // Clean sheets: a team that conceded 0 in a finished match.
  const cs = new Map<string, { team: TeamLite | null; count: number }>();
  for (const m of matchesQ.data ?? []) {
    if (m.score_a == null || m.score_b == null) continue;
    if (m.score_b === 0) {
      const c = cs.get(m.team_a_id) ?? { team: m.team_a, count: 0 };
      c.count++;
      cs.set(m.team_a_id, c);
    }
    if (m.score_a === 0) {
      const c = cs.get(m.team_b_id) ?? { team: m.team_b, count: 0 };
      c.count++;
      cs.set(m.team_b_id, c);
    }
  }
  const cleanSheets = [...cs.values()].sort((a, b) => b.count - a.count).slice(0, 15);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-4xl font-bold">Stats</h1>
        <p className="mt-2 text-muted-foreground">
          Premier League 2026/27 leaders — updates live as results and goals come in.
        </p>
      </header>

      {notSetUp && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/5 p-4 text-sm">
          <p className="font-bold text-foreground">⚙️ One-time setup needed</p>
          <p className="mt-1 text-muted-foreground">
            Goal stats need a small database table that isn&apos;t created yet. Once it&apos;s
            added, scorers &amp; assists appear here automatically.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <StatCard
          title="Top Scorers"
          unit="goals"
          icon={<Goal className="size-5 text-primary" />}
          rows={topScorers}
        />
        <StatCard
          title="Top Assists"
          unit="assists"
          icon={<Handshake className="size-5 text-magenta" />}
          rows={topAssisters}
        />
        <StatCard
          title="Most Clean Sheets"
          unit="clean sheets"
          icon={<ShieldCheck className="size-5 text-pitch" />}
          rows={cleanSheets.map((c) => ({
            name: c.team?.name ?? "—",
            count: c.count,
            team: c.team,
          }))}
          teamRow
        />
      </div>
    </div>
  );
}

function StatCard({
  title,
  unit,
  icon,
  rows,
  teamRow = false,
}: {
  title: string;
  unit: string;
  icon: React.ReactNode;
  rows: Array<{ name: string; count: number; team: TeamLite | null }>;
  teamRow?: boolean;
}) {
  return (
    <div className="rounded-3xl border border-border bg-surface p-5 shadow-card">
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <h2 className="font-display text-lg font-bold">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nothing yet — fills in as games are played.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r, i) => (
            <li
              key={`${r.name}-${i}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2"
            >
              <span className="w-5 shrink-0 text-center font-display text-sm font-bold text-muted-foreground">
                {i + 1}
              </span>
              <Crest src={r.team?.flag_emoji} size={22} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {r.name}
                {!teamRow && r.team?.code && (
                  <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                    {r.team.code}
                  </span>
                )}
              </span>
              <span className="shrink-0 font-display text-base font-bold">{r.count}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">Ranked by {unit}.</p>
    </div>
  );
}
