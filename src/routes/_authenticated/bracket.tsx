import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatNPTDate, formatNPT } from "@/lib/time";

export const Route = createFileRoute("/_authenticated/bracket")({
  head: () => ({ meta: [{ title: "Bracket · Uni-Corn Pool" }] }),
  component: BracketPage,
});

const STAGES = [
  { key: "r32", label: "Round of 32" },
  { key: "r16", label: "Round of 16" },
  { key: "qf", label: "Quarter-Final" },
  { key: "sf", label: "Semi-Final" },
  { key: "third", label: "Third Place" },
  { key: "final", label: "Final" },
] as const;

function BracketPage() {
  const { data: matches } = useQuery({
    queryKey: ["bracket"],
    queryFn: async () => {
      const { data } = await supabase
        .from("matches")
        .select("*, team_a:teams!matches_team_a_id_fkey(*), team_b:teams!matches_team_b_id_fkey(*)")
        .neq("stage", "group")
        .order("kickoff_utc");
      return data ?? [];
    },
  });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-4xl font-bold">Knockout bracket</h1>
        <p className="mt-2 text-muted-foreground">
          Round of 32 → Final + third-place match. Slots fill in automatically as group results
          lock in.
        </p>
      </header>

      <div className="overflow-x-auto pb-4">
        <div className="flex min-w-max gap-6">
          {STAGES.map((s) => {
            const list = (matches ?? []).filter((m) => m.stage === s.key);
            return (
              <div key={s.key} className="w-72 shrink-0">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  {s.label}
                </h3>
                <div className="space-y-3">
                  {list.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-6 text-center text-xs text-muted-foreground">
                      Awaiting qualifiers
                    </div>
                  )}
                  {list.map((m) => (
                    <div key={m.id} className="rounded-2xl border border-border bg-surface p-3 shadow-card">
                      <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        {m.time_tbc
                          ? "Time TBC"
                          : `${formatNPTDate(m.kickoff_utc)} · ${formatNPT(m.kickoff_utc)} NPT`}
                      </div>
                      <Side
                        team={m.team_a}
                        score={m.status === "finished" ? m.score_a : null}
                        winner={m.winner_team_id != null && m.winner_team_id === m.team_a_id}
                      />
                      <div className="my-1 h-px bg-border" />
                      <Side
                        team={m.team_b}
                        score={m.status === "finished" ? m.score_b : null}
                        winner={m.winner_team_id != null && m.winner_team_id === m.team_b_id}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Side({ team, score, winner }: { team: any; score: number | null; winner: boolean }) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg p-2 text-sm ${
        winner ? "bg-primary/10 font-bold" : ""
      }`}
    >
      <span className="flex items-center gap-2">
        <span className="text-lg">{team?.flag_emoji ?? "🏳️"}</span>
        <span>{team?.name ?? "TBD"}</span>
      </span>
      <span className="font-mono">{score ?? "—"}</span>
    </div>
  );
}
