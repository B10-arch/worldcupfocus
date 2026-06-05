import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatNPT, formatNPTDate } from "@/lib/time";

export const Route = createFileRoute("/_authenticated/matches")({
  head: () => ({ meta: [{ title: "Matches · Uni-Corn Pool" }] }),
  component: MatchesPage,
});

function MatchesPage() {
  const { data: matches } = useQuery({
    queryKey: ["matches", "all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("matches")
        .select("*, team_a:teams!matches_team_a_id_fkey(*), team_b:teams!matches_team_b_id_fkey(*)")
        .order("kickoff_utc");
      return data ?? [];
    },
  });

  const grouped = (matches ?? []).reduce<Record<string, typeof matches>>((acc, m) => {
    const day = formatNPTDate(m.kickoff_utc);
    acc[day] = acc[day] ?? [];
    acc[day]!.push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-display text-4xl font-bold">Match schedule</h1>
        <p className="mt-2 text-muted-foreground">
          All kickoff times converted to Nepal Standard Time (UTC +5:45).
        </p>
      </header>

      {Object.entries(grouped).map(([day, list]) => (
        <section key={day}>
          <h2 className="mb-4 font-display text-xl font-bold">{day}</h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">NPT</th>
                  <th className="px-4 py-3">Match</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Venue</th>
                  <th className="px-4 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list!.map((m) => (
                  <tr key={m.id} className="hover:bg-muted/50">
                    <td className="px-4 py-4 font-mono font-bold">{formatNPT(m.kickoff_utc)}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{m.team_a?.flag_emoji}</span>
                        <span className="font-semibold">{m.team_a?.name}</span>
                        <span className="text-muted-foreground">vs</span>
                        <span className="font-semibold">{m.team_b?.name}</span>
                        <span className="text-xl">{m.team_b?.flag_emoji}</span>
                        {m.status === "finished" && (
                          <span className="ml-2 rounded bg-muted px-2 py-0.5 font-mono text-xs font-bold">
                            {m.score_a}–{m.score_b}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-xs uppercase text-muted-foreground">
                      {m.stage === "group" ? `Group ${m.group_name}` : m.stage.toUpperCase()}
                    </td>
                    <td className="px-4 py-4 text-xs text-muted-foreground">{m.venue}</td>
                    <td className="px-4 py-4 text-right">
                      {m.status === "live" ? (
                        <span className="rounded-full bg-magenta/10 px-2 py-0.5 text-xs font-bold text-magenta">LIVE</span>
                      ) : m.status === "finished" ? (
                        <span className="text-xs font-bold text-muted-foreground">FT</span>
                      ) : (
                        <span className="text-xs font-bold text-primary">Upcoming</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
