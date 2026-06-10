import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/teams")({
  head: () => ({ meta: [{ title: "Teams & Groups · Focus World Cup Pool" }] }),
  component: TeamsPage,
});

type Team = {
  id: string;
  code: string;
  name: string;
  flag_emoji: string;
  group_name: string | null;
  fifa_rank: number | null;
  coach: string | null;
  wc_form: string | null;
};

function TeamsPage() {
  const { data: teams } = useQuery({
    queryKey: ["teams", "all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("*")
        .order("group_name")
        .order("name");
      return (data ?? []) as Team[];
    },
  });

  const { data: results } = useQuery({
    queryKey: ["group-results"],
    queryFn: async () => {
      const { data } = await supabase
        .from("matches")
        .select("group_name, status, score_a, score_b, team_a_id, team_b_id")
        .eq("stage", "group")
        .eq("status", "finished");
      return data ?? [];
    },
  });

  const groups: Record<string, Team[]> = {};
  for (const t of teams ?? []) {
    const g = t.group_name ?? "—";
    (groups[g] = groups[g] ?? []).push(t);
  }

  return (
    <div className="space-y-12">
      <header>
        <h1 className="font-display text-4xl font-bold">Groups & teams</h1>
        <p className="mt-2 text-muted-foreground">
          48 nations · 12 groups · standings update only from completed matches. Click any team for a
          full profile.
        </p>
      </header>

      {Object.keys(groups)
        .sort()
        .map((g) => {
          const list = groups[g]!;
          const standings = computeStandings(list, results ?? []);
          return (
            <section key={g} className="space-y-4">
              <h2 className="font-display text-xl font-bold">Group {g}</h2>

              {/* Standings table */}
              <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Team</th>
                      <th className="px-2 py-2 text-center">P</th>
                      <th className="px-2 py-2 text-center">W</th>
                      <th className="px-2 py-2 text-center">D</th>
                      <th className="px-2 py-2 text-center">L</th>
                      <th className="px-2 py-2 text-center">GF</th>
                      <th className="px-2 py-2 text-center">GA</th>
                      <th className="px-2 py-2 text-center">GD</th>
                      <th className="px-2 py-2 text-right">Pts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {standings.map((row, i) => (
                      <tr key={row.team.id} className="hover:bg-muted/40">
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2">
                          <Link
                            to="/teams/$code"
                            params={{ code: row.team.code }}
                            className="flex items-center gap-2 font-semibold hover:text-primary"
                          >
                            <span className="text-lg">{row.team.flag_emoji}</span>
                            {row.team.name}
                          </Link>
                        </td>
                        <td className="px-2 py-2 text-center font-mono">{row.p}</td>
                        <td className="px-2 py-2 text-center font-mono">{row.w}</td>
                        <td className="px-2 py-2 text-center font-mono">{row.d}</td>
                        <td className="px-2 py-2 text-center font-mono">{row.l}</td>
                        <td className="px-2 py-2 text-center font-mono">{row.gf}</td>
                        <td className="px-2 py-2 text-center font-mono">{row.ga}</td>
                        <td className="px-2 py-2 text-center font-mono">{row.gd}</td>
                        <td className="px-2 py-2 text-right font-display font-bold">{row.pts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Team profile cards */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {list.map((t) => (
                  <Link
                    key={t.id}
                    to="/teams/$code"
                    params={{ code: t.code }}
                    className="group rounded-2xl border border-border bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    <div className="flex items-start gap-3">
                      <div className="grid size-12 place-items-center rounded-xl bg-secondary text-3xl">
                        {t.flag_emoji}
                      </div>
                      <div className="flex-1">
                        <p className="font-display text-base font-bold leading-tight">{t.name}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{t.coach}</p>
                      </div>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                        #{t.fifa_rank}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
    </div>
  );
}

type Standing = {
  team: Team;
  p: number; w: number; d: number; l: number;
  gf: number; ga: number; gd: number; pts: number;
};

function computeStandings(teams: Team[], finishedMatches: any[]): Standing[] {
  const map = new Map<string, Standing>();
  for (const t of teams) {
    map.set(t.id, { team: t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 });
  }
  for (const m of finishedMatches) {
    const a = map.get(m.team_a_id);
    const b = map.get(m.team_b_id);
    if (!a || !b || m.score_a == null || m.score_b == null) continue;
    a.p++; b.p++;
    a.gf += m.score_a; a.ga += m.score_b;
    b.gf += m.score_b; b.ga += m.score_a;
    if (m.score_a > m.score_b) { a.w++; b.l++; a.pts += 3; }
    else if (m.score_a < m.score_b) { b.w++; a.l++; b.pts += 3; }
    else { a.d++; b.d++; a.pts += 1; b.pts += 1; }
  }
  for (const s of map.values()) s.gd = s.gf - s.ga;
  return [...map.values()].sort(
    (x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.team.name.localeCompare(y.team.name),
  );
}
