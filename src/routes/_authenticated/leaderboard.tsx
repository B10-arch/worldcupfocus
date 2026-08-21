import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/leaderboard")({
  head: () => ({ meta: [{ title: "Fantasy Table · Focus Premier League Pool" }] }),
  component: PoolTablePage,
});

type Entry = { id: string; team_name: string; manager_name: string };
type Score = { entry_id: string; gameweek: number; points: number };

function PoolTablePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["pool-table"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [entriesRes, scoresRes] = await Promise.all([
        (supabase as any).from("pool_entries").select("id, team_name, manager_name"),
        (supabase as any).from("pool_gw_scores").select("entry_id, gameweek, points"),
      ]);
      if (entriesRes.error) throw entriesRes.error;
      if (scoresRes.error) throw scoresRes.error;
      return {
        entries: (entriesRes.data ?? []) as Entry[],
        scores: (scoresRes.data ?? []) as Score[],
      };
    },
  });

  const entries = data?.entries ?? [];
  const scores = data?.scores ?? [];

  // Season total + weeks played per entry.
  const totals = new Map<string, { total: number; played: number }>();
  for (const e of entries) totals.set(e.id, { total: 0, played: 0 });
  for (const s of scores) {
    const t = totals.get(s.entry_id);
    if (!t) continue;
    t.total += s.points;
    t.played += 1;
  }

  const standings = entries
    .map((e) => ({ entry: e, ...(totals.get(e.id) ?? { total: 0, played: 0 }) }))
    .sort((a, b) => b.total - a.total || a.entry.team_name.localeCompare(b.entry.team_name));

  // Matchweek winners: the top scorer of each week. Ties share the week.
  const byGw = new Map<number, Score[]>();
  for (const s of scores) {
    if (!byGw.has(s.gameweek)) byGw.set(s.gameweek, []);
    byGw.get(s.gameweek)!.push(s);
  }
  const nameOf = new Map(entries.map((e) => [e.id, e.team_name]));
  const weeks = [...byGw.entries()]
    .map(([gw, list]) => {
      const best = Math.max(...list.map((s) => s.points));
      return {
        gw,
        points: best,
        winners: list
          .filter((s) => s.points === best)
          .map((s) => nameOf.get(s.entry_id) ?? "—")
          .sort(),
      };
    })
    .sort((a, b) => b.gw - a.gw);

  // Weeks won per entry, shown alongside the season total.
  const wins = new Map<string, number>();
  for (const w of weeks) {
    for (const name of w.winners) wins.set(name, (wins.get(name) ?? 0) + 1);
  }

  return (
    <div className="space-y-10">
      <header>
        <h1 className="flex items-center gap-2 font-display text-4xl font-bold">
          <Trophy className="size-8 text-primary" /> Fantasy table
        </h1>
        <p className="mt-2 text-muted-foreground">
          Premier League 2026/27 · {entries.length} managers · updated after every matchweek.
        </p>
      </header>

      {isLoading && <p className="text-muted-foreground">Loading table…</p>}
      {error && (
        <p className="rounded-2xl border border-border bg-surface p-6 text-magenta">
          Could not load the table — the 20260821000000_fantasy_pool.sql migration may not have been
          run yet.
        </p>
      )}

      {!isLoading && !error && (
        <>
          <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Manager</th>
                  <th className="px-2 py-2 text-center">MW</th>
                  <th className="px-2 py-2 text-center">Wins</th>
                  <th className="px-3 py-2 text-right">Pts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {standings.map((row, i) => (
                  <tr key={row.entry.id} className="hover:bg-muted/40">
                    <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2 font-semibold">{row.entry.team_name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.entry.manager_name}</td>
                    <td className="px-2 py-2 text-center font-mono">{row.played}</td>
                    <td className="px-2 py-2 text-center font-mono">
                      {wins.get(row.entry.team_name) ?? 0}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h2 className="mb-3 font-display text-xl font-bold">Matchweek winners</h2>
            {weeks.length === 0 ? (
              <p className="rounded-2xl border border-border bg-surface p-6 text-muted-foreground">
                No points recorded yet — the first matchweek winner shows up here once scores are
                entered.
              </p>
            ) : (
              <div className="space-y-2">
                {weeks.map((w) => (
                  <div
                    key={w.gw}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3"
                  >
                    <span className="shrink-0 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
                      Matchweek {w.gw}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-right font-semibold">
                      {w.winners.join(", ")}
                    </span>
                    <span className="shrink-0 rounded bg-muted px-2 py-0.5 font-mono text-sm font-bold">
                      {w.points}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
