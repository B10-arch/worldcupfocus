import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatNPR, BET_LOCK_UTC, isBetLocked, formatNPTFull } from "@/lib/time";
import { addPick, removePick, MAX_PICKS } from "@/lib/bets.functions";
import { toast } from "sonner";
import { Check, Lock, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/bet")({
  head: () => ({ meta: [{ title: "Choose your teams · Focus World Cup Pool" }] }),
  component: BetPage,
});

const ENTRY_FEE = 1000;

type Pick = {
  id: string;
  team_id: string;
  user_id?: string;
  placed_at?: string;
  team?: { flag_emoji?: string | null; name?: string | null } | null;
};

function BetPage() {
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const qc = useQueryClient();
  const addFn = useServerFn(addPick);
  const removeFn = useServerFn(removePick);
  const [busyTeamId, setBusyTeamId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const locked = isBetLocked();

  // Participants who have already chosen are frozen — their picks are final.
  const lockState = useQuery({
    queryKey: ["picks-locked", user.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("profiles")
        .select("picks_locked")
        .eq("id", user.id)
        .maybeSingle();
      return !!data?.picks_locked;
    },
  });
  const picksFinal = !!lockState.data;
  const frozen = locked || picksFinal;

  const teams = useQuery({
    queryKey: ["teams", "all"],
    queryFn: async () =>
      (await supabase.from("teams").select("*").order("group_name").order("name")).data ?? [],
  });

  const myPicks = useQuery({
    queryKey: ["my-picks", user.id],
    queryFn: async () =>
      (
        await supabase
          .from("bets")
          .select("*, team:teams(*)")
          .eq("user_id", user.id)
          .order("placed_at", { ascending: true })
      ).data ?? [],
  });

  const pickedIds = new Set((myPicks.data ?? []).map((p) => p.team_id));
  const remaining = MAX_PICKS - (myPicks.data?.length ?? 0);

  const filtered = (teams.data ?? []).filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()),
  );

  const picksKey = ["my-picks", user.id];

  async function handleAdd(teamId: string) {
    if (frozen) return;
    // Read the live cache (not the render-time closure) so fast successive clicks
    // are counted accurately and never optimistically exceed the max.
    const prev = qc.getQueryData<Pick[]>(picksKey) ?? [];
    if (prev.some((p) => p.team_id === teamId) || prev.length >= MAX_PICKS || busyTeamId === teamId)
      return;
    const team = teams.data?.find((t) => t.id === teamId);
    // Optimistic: reflect the pick immediately so a single click feels instant —
    // the server call + reconcile happen in the background.
    qc.setQueryData(picksKey, [
      ...prev,
      {
        id: `temp-${teamId}`,
        team_id: teamId,
        user_id: user.id,
        placed_at: new Date().toISOString(),
        team,
      },
    ]);
    setBusyTeamId(teamId);
    try {
      await addFn({ data: { teamId } });
      const newCount = prev.length + 1;
      const more = MAX_PICKS - newCount;
      toast.success(
        `Pick saved (${newCount}/${MAX_PICKS}). Rs. ${formatNPR(ENTRY_FEE * newCount)} total.${
          more > 0 ? ` You can add up to ${more} more.` : ""
        }`,
      );
      qc.invalidateQueries({ queryKey: picksKey }); // reconcile real row in background
      qc.invalidateQueries({ queryKey: ["has-bet", user.id] }); // unblock navigation after first pick
    } catch (err) {
      qc.setQueryData(picksKey, prev); // rollback on failure
      toast.error(err instanceof Error ? err.message : "Could not save pick");
    } finally {
      setBusyTeamId(null);
    }
  }

  async function handleRemove(teamId: string) {
    if (frozen) return;
    const prev = qc.getQueryData<Pick[]>(picksKey) ?? [];
    // Optimistic: drop the pick immediately.
    qc.setQueryData(
      picksKey,
      prev.filter((p) => p.team_id !== teamId),
    );
    setBusyTeamId(teamId);
    try {
      await removeFn({ data: { teamId } });
      toast.message("Pick removed");
      qc.invalidateQueries({ queryKey: picksKey });
      qc.invalidateQueries({ queryKey: ["has-bet", user.id] });
    } catch (err) {
      qc.setQueryData(picksKey, prev); // rollback on failure
      toast.error(err instanceof Error ? err.message : "Could not remove pick");
    } finally {
      setBusyTeamId(null);
    }
  }

  const picksCount = myPicks.data?.length ?? 0;
  const lockNotice = picksFinal
    ? "Your team picks are final and can no longer be changed."
    : locked
      ? `Picks locked at ${formatNPTFull(BET_LOCK_UTC)} — your teams are final.`
      : `You can back 1 to ${MAX_PICKS} teams — add or change them anytime while the pool is open.`;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-4xl font-bold">Choose your teams</h1>
        <p className="mt-2 text-muted-foreground">
          Back between 1 and {MAX_PICKS} distinct nations — your call. Rs. {formatNPR(ENTRY_FEE)}{" "}
          per team (so Rs. {formatNPR(ENTRY_FEE)}, {formatNPR(ENTRY_FEE * 2)}, or{" "}
          {formatNPR(ENTRY_FEE * MAX_PICKS)} total). Each pick earns points independently; share the
          per-team pot with anyone else backing the same nation.
        </p>
        {picksCount >= 1 && (
          <div className="mt-4">
            <button
              onClick={() => router.navigate({ to: "/dashboard" })}
              className="inline-flex items-center gap-2 rounded-full bg-pitch px-4 py-2 text-sm font-bold text-white transition hover:scale-105"
            >
              Go to dashboard ({picksCount} pick{picksCount === 1 ? "" : "s"} · Rs.{" "}
              {formatNPR(ENTRY_FEE * picksCount)})
            </button>
          </div>
        )}
      </header>

      <div
        className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${
          frozen ? "border-magenta/30 bg-magenta/5" : "border-primary/30 bg-primary/5"
        }`}
        title={lockNotice}
      >
        <Lock className={`mt-0.5 size-4 ${frozen ? "text-magenta" : "text-primary"}`} />
        <p>{lockNotice}</p>
      </div>

      {/* Current picks */}
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Your picks ({myPicks.data?.length ?? 0}/{MAX_PICKS})
          </p>
          {remaining > 0 && !frozen && (
            <span className="text-xs text-primary">Add up to {remaining} more (optional)</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {(myPicks.data ?? []).map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-bold"
            >
              <span className="text-lg">{p.team?.flag_emoji}</span>
              {p.team?.name}
              {!frozen && (
                <button
                  onClick={() => handleRemove(p.team_id)}
                  disabled={busyTeamId === p.team_id}
                  className="ml-1 rounded-full p-0.5 hover:bg-magenta/10"
                  title="Remove pick"
                >
                  <X className="size-3" />
                </button>
              )}
            </span>
          ))}
          {(myPicks.data?.length ?? 0) === 0 && (
            <span className="text-sm text-muted-foreground">
              No picks yet — choose at least 1 team (up to {MAX_PICKS}) below.
            </span>
          )}
        </div>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search 48 teams…"
        className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((t) => {
          const isPicked = pickedIds.has(t.id);
          const underdog = t.fifa_rank != null && t.fifa_rank > 15;
          const disabled = frozen || (!isPicked && remaining <= 0);
          return (
            <button
              key={t.id}
              onClick={() => (isPicked ? handleRemove(t.id) : handleAdd(t.id))}
              disabled={disabled || busyTeamId === t.id}
              title={
                frozen
                  ? lockNotice
                  : isPicked
                    ? "Click to remove"
                    : remaining <= 0
                      ? `You already have ${MAX_PICKS} picks (the max). Remove one to swap.`
                      : "Click to add"
              }
              className={`group flex items-center gap-3 rounded-2xl border p-4 text-left transition ${
                isPicked
                  ? "border-pitch bg-pitch/5 ring-2 ring-pitch"
                  : "border-border bg-surface hover:border-primary/50"
              } ${disabled && !isPicked ? "cursor-not-allowed opacity-50 hover:border-border" : ""}`}
            >
              <div className="grid size-12 place-items-center rounded-xl bg-secondary text-3xl">
                {t.flag_emoji}
              </div>
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
              {isPicked && <Check className="size-5 text-pitch" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
