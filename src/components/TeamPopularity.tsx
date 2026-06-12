import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users } from "lucide-react";

type Row = {
  team_id: string;
  name: string;
  code: string;
  flag_emoji: string;
  backers: number;
};

/** Ranked "how many players backed each nation" panel. */
export function TeamPopularity() {
  const { data } = useQuery({
    queryKey: ["team-popularity"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("team_popularity")
        .select("team_id, name, code, flag_emoji, backers")
        .gt("backers", 0)
        .order("backers", { ascending: false })
        .order("name", { ascending: true });
      return (data ?? []) as Row[];
    },
  });

  const rows = data ?? [];
  const max = rows[0]?.backers ?? 1;

  return (
    <div className="rounded-3xl border border-border bg-surface p-6 shadow-card">
      <div className="flex items-center gap-2">
        <Users className="size-5 text-primary" />
        <h2 className="font-display text-xl font-bold">Most-backed teams</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">How many players backed each nation.</p>
      <div className="mt-4 space-y-2">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No picks yet.</p>}
        {rows.map((r, i) => (
          <div key={r.team_id} className="flex items-center gap-3">
            <span className="w-5 shrink-0 text-right font-display text-sm font-bold text-muted-foreground">
              {i + 1}
            </span>
            <span className="text-lg leading-none">{r.flag_emoji}</span>
            <span className="w-28 shrink-0 truncate text-sm font-bold" title={r.name}>
              {r.name}
            </span>
            <div className="h-2 flex-1 rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max((r.backers / max) * 100, 6)}%` }}
              />
            </div>
            <span className="w-20 shrink-0 text-right text-sm">
              <span className="font-bold">{r.backers}</span>{" "}
              <span className="text-xs text-muted-foreground">
                user{r.backers === 1 ? "" : "s"}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
