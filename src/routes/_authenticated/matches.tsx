import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatNPT, formatNPTDate, isTournamentStarted } from "@/lib/time";
import { MatchHighlights } from "@/components/MatchHighlights";

export const Route = createFileRoute("/_authenticated/matches")({
  head: () => ({ meta: [{ title: "Matches · Focus World Cup Pool" }] }),
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

  // Group: confirmed matches by NPT date; everything else under "Time TBC".
  const confirmed = (matches ?? []).filter((m) => !m.time_tbc);
  const tbc = (matches ?? []).filter((m) => m.time_tbc);

  const grouped = confirmed.reduce<Record<string, typeof confirmed>>((acc, m) => {
    const day = formatNPTDate(m.kickoff_utc);
    acc[day] = acc[day] ?? [];
    acc[day]!.push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-10">
      <header>
        <h2 className="font-display text-4xl font-bold">Match schedule</h2>
        <p className="mt-2 text-muted-foreground">
          All kickoff times converted to Nepal Standard Time (UTC +5:45).
          {!isTournamentStarted() &&
            " The tournament has not started yet — no scores will appear until matches kick off."}
        </p>
      </header>

      {Object.entries(grouped).map(([day, list]) => (
        <Section key={day} title={day} list={list!} />
      ))}

      {tbc.length > 0 && (
        <Section
          title="Time TBC"
          subtitle="Fixture confirmed; kickoff time will be published by FIFA closer to the date."
          list={tbc}
          hideTime
        />
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  list,
  hideTime,
}: {
  title: string;
  subtitle?: string;
  list: any[];
  hideTime?: boolean;
}) {
  return (
    <section>
      <h3 className="mb-1 font-display text-xl font-bold">{title}</h3>
      {subtitle && <p className="mb-4 text-xs text-muted-foreground">{subtitle}</p>}
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
            {list.map((m) => {
              const played = m.status === "finished";
              return (
                <tr key={m.id} className="hover:bg-muted/50">
                  <td className="px-4 py-4 font-mono font-bold">
                    {hideTime ? (
                      <span className="text-muted-foreground">TBC</span>
                    ) : (
                      formatNPT(m.kickoff_utc)
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{m.team_a?.flag_emoji ?? "🏳️"}</span>
                      <span className="font-semibold">{m.team_a?.name ?? "TBD"}</span>
                      <span className="text-muted-foreground">vs</span>
                      <span className="font-semibold">{m.team_b?.name ?? "TBD"}</span>
                      <span className="text-xl">{m.team_b?.flag_emoji ?? "🏳️"}</span>
                      {played && (
                        <span className="ml-2 rounded bg-muted px-2 py-0.5 font-mono text-xs font-bold">
                          {m.score_a}–{m.score_b}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-xs uppercase text-muted-foreground">
                    {m.stage === "group" ? `Group ${m.group_name}` : m.stage.toUpperCase()}
                  </td>
                  <td className="px-4 py-4 text-xs text-muted-foreground">{m.venue ?? "TBC"}</td>
                  <td className="px-4 py-4 text-right">
                    {m.status === "live" ? (
                      <span className="rounded-full bg-magenta/10 px-2 py-0.5 text-xs font-bold text-magenta">
                        LIVE
                      </span>
                    ) : played ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs font-bold text-muted-foreground">FT</span>
                        <MatchHighlights match={m} compact />
                      </div>
                    ) : (
                      <span className="text-xs font-bold text-primary">Upcoming</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
