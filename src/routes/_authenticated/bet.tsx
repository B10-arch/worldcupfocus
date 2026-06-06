import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatNPR, BET_LOCK_UTC, isBetLocked, formatNPTFull } from "@/lib/time";
import { toast } from "sonner";
import { Check, Lock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/bet")({
  head: () => ({ meta: [{ title: "Choose your team · Uni-Corn Pool" }] }),
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
  const locked = isBetLocked();

  const teams = useQuery({
    queryKey: ["teams", "all"],
    queryFn: async () =>
      (await supabase.from("teams").select("*").order("group_name").order("name")).data ?? [],
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
    if (!selected || locked) return;
    setSaving(true);
    try {
      const payload = { user_id: user.id, team_id: selected, entry_fee: ENTRY_FEE };
      const { error } = await supabase.from("bets").upsert(payload, { onConflict: "user_id" });
      if (error) throw error;
      toast.success(myBet.data ? "Team updated!" : "Team locked in! Pay Rs. 1,000 to confirm.");
      await qc.invalidateQueries();
      router.navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save your pick");
    } finally {
      setSaving(false);
    }
  }

  const lockNotice = locked
    ? `Team selection locked at ${formatNPTFull(BET_LOCK_UTC)} — bets are final once the tournament begins.`
    : `You can change your team until ${formatNPTFull(BET_LOCK_UTC)}.`;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-4xl font-bold">
          {myBet.data ? "Your team" : "Choose your team"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          Pick one of 48 nations. Flat entry of Rs. {formatNPR(ENTRY_FEE)}. If multiple players pick the
          same team, you split the pot equally.
        </p>
      </header>

      <div
        className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${
          locked ? "border-magenta/30 bg-magenta/5" : "border-primary/30 bg-primary/5"
        }`}
        title={lockNotice}
      >
        <Lock className={`mt-0.5 size-4 ${locked ? "text-magenta" : "text-primary"}`} />
        <p>{lockNotice}</p>
      </div>

      {myBet.data && (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm shadow-card">
          Currently backing:{" "}
          <strong>
            {myBet.data.team?.flag_emoji} {myBet.data.team?.name}
          </strong>
          {" · "}
          <span className="text-muted-foreground">
            Submitted {new Date(myBet.data.placed_at).toLocaleString()}
          </span>
        </div>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search 48 teams…"
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
              onClick={() => !locked && setSelected(t.id)}
              disabled={locked}
              title={locked ? lockNotice : undefined}
              className={`group flex items-center gap-3 rounded-2xl border p-4 text-left transition ${
                isPicked
                  ? "border-primary bg-primary/5 ring-2 ring-primary"
                  : "border-border bg-surface hover:border-primary/50"
              } ${locked ? "cursor-not-allowed opacity-60 hover:border-border" : ""}`}
            >
              <div className="grid size-12 place-items-center rounded-xl bg-secondary text-3xl">{t.flag_emoji}</div>
              <div className="flex-1">
                <p className="font-bold">{t.name}</p>
                <p className="text-xs text-muted-foreground">
                  Group {t.group_name} · FIFA #{t.fifa_rank}
                  {underdog && (
                    <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-pop">
                      Underdog
                    </span>
                  )}
                </p>
              </div>
              {isCurrent && <Check className="size-4 text-pitch" />}
            </button>
          );
        })}
      </div>

      {selected && !locked && (
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
              {saving ? "Saving…" : myBet.data ? "Update team" : "Lock in team"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
