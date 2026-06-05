import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Crown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard · Uni-Corn Pool" }] }),
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const { user } = Route.useRouteContext();
  const { data } = useQuery({
    queryKey: ["leaderboard", "full"],
    queryFn: async () => {
      const { data: bets } = await supabase
        .from("bets")
        .select("*, team:teams(*)")
        .order("points", { ascending: false })
        .order("placed_at", { ascending: true });
      const ids = (bets ?? []).map((b) => b.user_id);
      const { data: profiles } = await supabase.from("profiles").select("*").in("id", ids);
      const pMap = new Map((profiles ?? []).map((p) => [p.id, p]));
      return (bets ?? []).map((b) => ({ ...b, profile: pMap.get(b.user_id) }));
    },
  });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-4xl font-bold">Leaderboard</h1>
        <p className="mt-2 text-muted-foreground">
          Points update automatically as results come in. Tiebreaker: earliest bet timestamp.
        </p>
      </header>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Rank</th>
              <th className="px-4 py-3">Player</th>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3">Placed</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3 text-right">Points</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data?.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No bets placed yet.</td></tr>
            )}
            {data?.map((row, i) => {
              const me = row.user_id === user.id;
              return (
                <tr key={row.id} className={me ? "bg-primary/5" : "hover:bg-muted/40"}>
                  <td className="px-4 py-4 font-display text-lg font-bold">
                    {i === 0 ? (
                      <span className="inline-flex items-center gap-1 text-amber-pop">
                        <Crown className="size-4" /> 01
                      </span>
                    ) : String(i + 1).padStart(2, "0")}
                  </td>
                  <td className="px-4 py-4 font-bold">
                    {row.profile?.display_name ?? "Player"}
                    {me && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">You</span>}
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-lg">{row.team?.flag_emoji}</span> {row.team?.name}
                  </td>
                  <td className="px-4 py-4 text-xs text-muted-foreground">
                    {new Date(row.placed_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-4">
                    {/* payment status lives on profile */}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                      paid
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right font-display text-lg font-bold">{row.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
