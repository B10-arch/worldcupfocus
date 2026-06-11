import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard · Focus World Cup Pool" }] }),
  component: LeaderboardPage,
});

type Pick = {
  bet_id: string;
  team_id: string;
  team_name: string;
  team_code: string;
  team_flag_emoji: string;
  fifa_rank: number | null;
  points: number;
  placed_at: string;
};

type LeaderboardRow = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  points: number;
  pick_count: number;
  first_placed_at: string | null;
  confirmed_at: string | null;
  picks: Pick[];
};

function LeaderboardPage() {
  const { user } = Route.useRouteContext();
  const { data } = useQuery({
    queryKey: ["leaderboard", "full"],
    refetchInterval: 60_000, // live: standings update as results come in
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("leaderboard_entries")
        .select("*")
        .gt("pick_count", 0)
        .order("points", { ascending: false })
        .order("confirmed_at", { ascending: true });
      return (data ?? []) as LeaderboardRow[];
    },
  });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-4xl font-bold">Leaderboard</h1>
        <p className="mt-2 text-muted-foreground">
          Points update automatically as results come in. Each player backs 1–3 teams.
        </p>
      </header>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Rank</th>
              <th className="px-4 py-3">Player</th>
              <th className="px-4 py-3">Teams</th>
              <th className="px-4 py-3">Confirmed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data?.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No picks placed yet.</td></tr>
            )}
            {data?.map((row, i) => {
              const me = row.user_id === user.id;
              return (
                <tr key={row.user_id} className={me ? "bg-primary/5" : "hover:bg-muted/40"}>
                  <td className="px-4 py-4 font-display text-lg font-bold">
                    {String(i + 1).padStart(2, "0")}
                  </td>
                  <td className="px-4 py-4 font-bold">
                    {row.display_name ?? "Player"}
                    {me && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">You</span>}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {(row.picks ?? []).map((p) => (
                        <span
                          key={p.bet_id}
                          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                          title={`${p.team_name} · ${p.points} pts`}
                        >
                          <span className="text-base leading-none">{p.team_flag_emoji}</span>
                          <span className="font-bold">{p.team_code}</span>
                          <span className="text-muted-foreground">{p.points}</span>
                        </span>
                      ))}
                      {row.pick_count < 3 && (
                        <span className="text-[10px] uppercase text-muted-foreground">
                          {row.pick_count}/3 picks
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-xs text-muted-foreground">
                    {row.confirmed_at ? new Date(row.confirmed_at).toLocaleString() : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
