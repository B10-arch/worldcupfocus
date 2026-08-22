import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trophy } from "lucide-react";

type Entry = { id: string; team_name: string; manager_name: string };
type Score = { entry_id: string; gameweek: number; points: number };

/**
 * Admin control for the fantasy pool: pick a matchweek, type each entry's
 * points, save. The matchweek winner is whoever scored most that week (shown
 * live as you type) — it's derived, never stored, so it can't drift out of step
 * with the points.
 */
export function PoolAdmin() {
  const qc = useQueryClient();
  const [gw, setGw] = useState(1);
  const [points, setPoints] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const loadedGw = useRef<number | null>(null);

  const entriesQ = useQuery({
    queryKey: ["pool-entries"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pool_entries")
        .select("id, team_name, manager_name")
        .order("team_name");
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
  });

  const scoresQ = useQuery({
    queryKey: ["pool-scores"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pool_gw_scores")
        .select("entry_id, gameweek, points");
      if (error) throw error;
      return (data ?? []) as Score[];
    },
  });

  // Load the selected matchweek's saved points into the form. Re-runs on every
  // matchweek change, so switching weeks shows that week's numbers.
  useEffect(() => {
    if (!scoresQ.data || loadedGw.current === gw) return;
    const next: Record<string, string> = {};
    for (const s of scoresQ.data) {
      if (s.gameweek === gw) next[s.entry_id] = String(s.points);
    }
    setPoints(next);
    loadedGw.current = gw;
  }, [scoresQ.data, gw]);

  async function save() {
    setSaving(true);
    // Blank means "not played yet" — skip it rather than recording a real zero.
    const rows = (entriesQ.data ?? [])
      .filter((e) => (points[e.id] ?? "").trim() !== "")
      .map((e) => ({
        entry_id: e.id,
        gameweek: gw,
        points: Number(points[e.id]),
        updated_at: new Date().toISOString(),
      }));
    const bad = rows.find((r) => !Number.isFinite(r.points));
    if (bad) {
      setSaving(false);
      toast.error("Points must be numbers");
      return;
    }
    const { error } = await (supabase as any)
      .from("pool_gw_scores")
      .upsert(rows, { onConflict: "entry_id,gameweek" });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Matchweek ${gw} saved`);
    qc.invalidateQueries({ queryKey: ["pool-scores"] });
    qc.invalidateQueries({ queryKey: ["pool-table"] });
  }

  const entries = entriesQ.data ?? [];
  const allScores = scoresQ.data ?? [];

  // Season standings — the same table everyone sees on the Fantasy Table page,
  // repeated here so you can enter points and watch the effect without leaving
  // the panel. Weeks won are derived, matching the public page exactly.
  const totals = new Map<string, { total: number; played: number }>();
  for (const e of entries) totals.set(e.id, { total: 0, played: 0 });
  for (const sc of allScores) {
    const t = totals.get(sc.entry_id);
    if (!t) continue;
    t.total += sc.points;
    t.played += 1;
  }
  const byWeek = new Map<number, Score[]>();
  for (const sc of allScores) {
    if (!byWeek.has(sc.gameweek)) byWeek.set(sc.gameweek, []);
    byWeek.get(sc.gameweek)!.push(sc);
  }
  const weeksWon = new Map<string, number>();
  for (const list of byWeek.values()) {
    const top = Math.max(...list.map((x) => x.points));
    for (const sc of list.filter((x) => x.points === top)) {
      weeksWon.set(sc.entry_id, (weeksWon.get(sc.entry_id) ?? 0) + 1);
    }
  }
  const standings = entries
    .map((e) => ({ e, ...(totals.get(e.id) ?? { total: 0, played: 0 }) }))
    .sort((a, b) => b.total - a.total || a.e.team_name.localeCompare(b.e.team_name));
  // Live winner preview from what's currently typed.
  const typed = entries
    .map((e) => ({ e, n: Number(points[e.id]) }))
    .filter((x) => (points[x.e.id] ?? "").trim() !== "" && Number.isFinite(x.n));
  const best = typed.length ? Math.max(...typed.map((x) => x.n)) : null;
  const winners = best === null ? [] : typed.filter((x) => x.n === best).map((x) => x.e.team_name);

  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="rounded-3xl border border-border bg-surface p-6 shadow-card">
      <div className="flex items-center gap-2">
        <Trophy className="size-5 text-primary" />
        <h2 className="font-display text-xl font-bold">Fantasy Pool points</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Pick a matchweek and enter each entry&apos;s points. Leave a box blank if they haven&apos;t
        played that week. The table everyone sees updates as soon as you save.
      </p>

      <label className="mt-4 block sm:w-56">
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Matchweek
        </span>
        <select value={gw} onChange={(e) => setGw(Number(e.target.value))} className={inputClass}>
          {Array.from({ length: 38 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              Matchweek {n}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-4 space-y-2">
        {entriesQ.isLoading && <p className="text-sm text-muted-foreground">Loading entries…</p>}
        {entriesQ.error && (
          <p className="text-sm text-magenta">
            Could not load entries — run the 20260821000000_fantasy_pool.sql migration first.
          </p>
        )}
        {entries.map((e) => (
          <div
            key={e.id}
            className="flex flex-col gap-1.5 rounded-xl border border-border bg-background p-3 sm:flex-row sm:items-center sm:gap-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{e.team_name}</p>
              <p className="truncate text-xs text-muted-foreground">{e.manager_name}</p>
            </div>
            <input
              type="number"
              inputMode="numeric"
              value={points[e.id] ?? ""}
              onChange={(ev) => setPoints((p) => ({ ...p, [e.id]: ev.target.value }))}
              placeholder="Points"
              className={`${inputClass} sm:w-32`}
            />
          </div>
        ))}
      </div>

      {winners.length > 0 && (
        <p className="mt-3 text-sm">
          <span className="font-bold text-primary">Matchweek {gw} winner:</span>{" "}
          <span className="text-foreground">{winners.join(", ")}</span>{" "}
          <span className="text-muted-foreground">({best} pts)</span>
        </p>
      )}

      <button
        onClick={save}
        disabled={saving || entries.length === 0}
        className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Saving…" : `Save matchweek ${gw}`}
      </button>

      {entries.length > 0 && (
        <div className="mt-8">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Fantasy table
          </p>
          <div className="overflow-hidden rounded-2xl border border-border bg-background">
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
                  <tr key={row.e.id} className="hover:bg-muted/40">
                    <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2 font-semibold">{row.e.team_name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.e.manager_name}</td>
                    <td className="px-2 py-2 text-center font-mono">{row.played}</td>
                    <td className="px-2 py-2 text-center font-mono">
                      {weeksWon.get(row.e.id) ?? 0}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
