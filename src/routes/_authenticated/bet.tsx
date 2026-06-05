import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatNPR } from "@/lib/time";
import { toast } from "sonner";
import { Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/bet")({
  head: () => ({ meta: [{ title: "Place your bet · Uni-Corn Pool" }] }),
  component: BetPage,
});

const ENTRY_FEE = 1000;

function BetPage() {
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const teams = useQuery({
    queryKey: ["teams", "all"],
    queryFn: async () => (await supabase.from("teams").select("*").order("fifa_rank")).data ?? [],
  });

  const myBet = useQuery({
    queryKey: ["my-bet", user.id],
    queryFn: async () =>
      (await supabase.from("bets").select("*, team:teams(*)").eq("user_id", user.id).maybeSingle()).data,
  });

  const splitCount = useQuery({
    queryKey: ["split-count", selected],
    enabled: !!selected,
    queryFn: async () => {
      const { count } = await supabase
        .from("bets")
        .select("*", { count: "exact", head: true })
        .eq("team_id", selected!);
      return count ?? 0;
    },
  });

  const filtered = (teams.data ?? []).filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()),
  );

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    try {
      const payload = { user_id: user.id, team_id: selected, entry_fee: ENTRY_FEE };
      const { error } = await supabase.from("bets").upsert(payload, { onConflict: "user_id" });
      if (error) throw error;
      toast.success(myBet.data ? "Bet updated!" : "Bet locked in! Pay Rs. 1,000 to confirm.");
      qc.invalidateQueries();
      router.navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save bet");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-4xl font-bold">{myBet.data ? "Change your team" : "Back your champion"}</h1>
        <p className="mt-2 text-muted-foreground">
          Flat entry of Rs. {formatNPR(ENTRY_FEE)}. If multiple players pick the same team, you'll split the pot equally.
        </p>
      </header>

      {myBet.data && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm">
          Currently backing:{" "}
          <strong>
            {myBet.data.team?.flag_emoji} {myBet.data.team?.name}
          </strong>
        </div>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search teams…"
        className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((t) => {
          const isPicked = selected === t.id;
          const isCurrent = myBet.data?.team_id === t.id;
          const underdog = t.fifa_rank != null && t.fifa_rank > 15;
          return (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className={`group flex items-center gap-3 rounded-2xl border p-4 text-left transition ${
                isPicked
                  ? "border-primary bg-primary/5 ring-2 ring-primary"
                  : "border-border bg-surface hover:border-primary/50"
              }`}
            >
              <div className="grid size-12 place-items-center rounded-xl bg-secondary text-3xl">{t.flag_emoji}</div>
              <div className="flex-1">
                <p className="font-bold">{t.name}</p>
                <p className="text-xs text-muted-foreground">
                  FIFA #{t.fifa_rank}
                  {underdog && <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-pop">Underdog</span>}
                </p>
              </div>
              {isCurrent && <Check className="size-4 text-pitch" />}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="sticky bottom-4 z-20 mx-auto max-w-2xl rounded-2xl border border-border bg-night p-4 text-white shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400">Selected</p>
              <p className="font-display text-lg font-bold">
                {teams.data?.find((t) => t.id === selected)?.flag_emoji}{" "}
                {teams.data?.find((t) => t.id === selected)?.name}
              </p>
              {splitCount.data != null && splitCount.data > 0 && (
                <p className="text-xs text-amber-pop">
                  {splitCount.data} other player{splitCount.data === 1 ? "" : "s"} backing this team — pot splits.
                </p>
              )}
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition hover:scale-105 disabled:opacity-50"
            >
              {saving ? "Saving…" : myBet.data ? "Update bet" : "Lock in bet"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
