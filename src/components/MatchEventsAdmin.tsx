import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Goal, Trash2 } from "lucide-react";
import { Crest } from "@/components/Crest";
import { formatNPTDate } from "@/lib/time";

type T = { id: string; name: string | null; flag_emoji: string | null } | null;
type AdminMatch = {
  id: string;
  status: string;
  kickoff_utc: string;
  score_a: number | null;
  score_b: number | null;
  team_a: T;
  team_b: T;
};
type Ev = {
  id: string;
  match_id: string;
  team_id: string | null;
  kind: string;
  minute: number | null;
  scorer: string;
  assist: string | null;
};
type Draft = {
  side: "home" | "away";
  scorer: string;
  assist: string;
  minute: string;
  kind: string;
};
const blank: Draft = { side: "home", scorer: "", assist: "", minute: "", kind: "goal" };

/** Admin: record a match's score/status and its goals (scorer, assist, minute).
 *  Feeds the Matches goal lists and the Stats leaders. */
export function MatchEventsAdmin() {
  const qc = useQueryClient();

  const matchesQ = useQuery({
    queryKey: ["admin-result-matches"],
    retry: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("matches")
        .select(
          "id, status, kickoff_utc, score_a, score_b, team_a:teams!matches_team_a_id_fkey(id,name,flag_emoji), team_b:teams!matches_team_b_id_fkey(id,name,flag_emoji)",
        )
        .eq("stage", "league")
        .order("kickoff_utc", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AdminMatch[];
    },
  });

  const eventsQ = useQuery({
    queryKey: ["admin-match-events"],
    retry: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("match_events")
        .select("*")
        .order("minute", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Ev[];
    },
  });
  const eventsMissing = /match_events|does not exist|schema cache|relation/i.test(
    String((eventsQ.error as any)?.message ?? ""),
  );
  const byMatch = new Map<string, Ev[]>();
  for (const e of eventsQ.data ?? []) {
    const a = byMatch.get(e.match_id) ?? [];
    a.push(e);
    byMatch.set(e.match_id, a);
  }

  const [scores, setScores] = useState<Record<string, { a: string; b: string; status: string }>>(
    {},
  );
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function saveScore(m: AdminMatch) {
    const s = scores[m.id];
    if (!s) return;
    setBusy(m.id + "-score");
    const { error } = await (supabase as any)
      .from("matches")
      .update({
        score_a: s.a === "" ? null : Number(s.a),
        score_b: s.b === "" ? null : Number(s.b),
        status: s.status,
      })
      .eq("id", m.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Result saved");
    qc.invalidateQueries({ queryKey: ["admin-result-matches"] });
    qc.invalidateQueries({ queryKey: ["matches"] });
    qc.invalidateQueries({ queryKey: ["finished-league-matches"] });
  }

  async function addGoal(m: AdminMatch) {
    const d = drafts[m.id] ?? blank;
    if (!d.scorer.trim()) return toast.error("Enter who scored.");
    const teamId = d.side === "home" ? m.team_a?.id : m.team_b?.id;
    setBusy(m.id + "-goal");
    const { error } = await (supabase as any).from("match_events").insert({
      match_id: m.id,
      team_id: teamId,
      kind: d.kind,
      minute: d.minute === "" ? null : Number(d.minute),
      scorer: d.scorer.trim(),
      assist: d.assist.trim() || null,
    });
    setBusy(null);
    if (error)
      return toast.error(eventsMissing ? "Goals need the latest SQL update first." : error.message);
    setDrafts((p) => ({ ...p, [m.id]: blank }));
    qc.invalidateQueries({ queryKey: ["admin-match-events"] });
    qc.invalidateQueries({ queryKey: ["match-events"] });
    qc.invalidateQueries({ queryKey: ["match-events-all"] });
  }

  async function delGoal(id: string) {
    const { error } = await (supabase as any).from("match_events").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-match-events"] });
    qc.invalidateQueries({ queryKey: ["match-events"] });
    qc.invalidateQueries({ queryKey: ["match-events-all"] });
  }

  return (
    <div className="rounded-3xl border border-border bg-surface p-6 shadow-card">
      <div className="flex items-center gap-2">
        <Goal className="size-5 text-primary" />
        <h2 className="font-display text-xl font-bold">Results &amp; Goals</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Set each match&apos;s score and mark it finished, then log goals (scorer, assist, minute).
        These drive the goal lists on Matches and the Top Scorer / Assist / Clean Sheet leaders.
      </p>

      {eventsMissing && (
        <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/5 p-3 text-sm">
          <strong className="text-foreground">Goals table not created yet.</strong> Run{" "}
          <code>supabase/migrations/20260725000000_match_events.sql</code> in the Supabase SQL
          Editor, then refresh. (Scores still save without it.)
        </div>
      )}

      <div className="mt-4 space-y-3">
        {matchesQ.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {(matchesQ.data ?? []).map((m) => {
          const s = scores[m.id] ?? {
            a: m.score_a?.toString() ?? "",
            b: m.score_b?.toString() ?? "",
            status: m.status,
          };
          const d = drafts[m.id] ?? blank;
          const goals = byMatch.get(m.id) ?? [];
          return (
            <div key={m.id} className="rounded-xl border border-border bg-background p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">
                  {formatNPTDate(m.kickoff_utc)}
                </span>
                <span className="flex items-center gap-1.5 font-bold">
                  <Crest src={m.team_a?.flag_emoji} size={18} /> {m.team_a?.name}
                </span>
                <input
                  type="number"
                  value={s.a}
                  onChange={(e) =>
                    setScores((p) => ({ ...p, [m.id]: { ...s, a: e.target.value } }))
                  }
                  className="w-12 rounded border border-border bg-surface px-2 py-1 text-center"
                />
                <span>–</span>
                <input
                  type="number"
                  value={s.b}
                  onChange={(e) =>
                    setScores((p) => ({ ...p, [m.id]: { ...s, b: e.target.value } }))
                  }
                  className="w-12 rounded border border-border bg-surface px-2 py-1 text-center"
                />
                <span className="flex items-center gap-1.5 font-bold">
                  {m.team_b?.name} <Crest src={m.team_b?.flag_emoji} size={18} />
                </span>
                <select
                  value={s.status}
                  onChange={(e) =>
                    setScores((p) => ({ ...p, [m.id]: { ...s, status: e.target.value } }))
                  }
                  className="rounded border border-border bg-surface px-2 py-1 text-xs"
                >
                  <option value="scheduled">scheduled</option>
                  <option value="live">live</option>
                  <option value="finished">finished</option>
                </select>
                <button
                  onClick={() => saveScore(m)}
                  disabled={busy === m.id + "-score"}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
                >
                  Save result
                </button>
              </div>

              {/* Existing goals */}
              {goals.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {goals.map((e) => (
                    <li
                      key={e.id}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px]"
                    >
                      ⚽ {e.minute != null ? `${e.minute}' ` : ""}
                      {e.scorer}
                      {e.kind === "own_goal" ? " (OG)" : e.kind === "penalty" ? " (pen)" : ""}
                      {e.assist ? ` · ${e.assist}` : ""}
                      <button
                        onClick={() => delGoal(e.id)}
                        className="text-magenta hover:opacity-70"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* Add goal */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <select
                  value={d.side}
                  onChange={(e) =>
                    setDrafts((p) => ({ ...p, [m.id]: { ...d, side: e.target.value as any } }))
                  }
                  className="rounded border border-border bg-surface px-2 py-1"
                >
                  <option value="home">{m.team_a?.name}</option>
                  <option value="away">{m.team_b?.name}</option>
                </select>
                <input
                  value={d.scorer}
                  onChange={(e) =>
                    setDrafts((p) => ({ ...p, [m.id]: { ...d, scorer: e.target.value } }))
                  }
                  placeholder="Scorer"
                  className="w-28 rounded border border-border bg-surface px-2 py-1"
                />
                <input
                  value={d.assist}
                  onChange={(e) =>
                    setDrafts((p) => ({ ...p, [m.id]: { ...d, assist: e.target.value } }))
                  }
                  placeholder="Assist (opt)"
                  className="w-28 rounded border border-border bg-surface px-2 py-1"
                />
                <input
                  type="number"
                  value={d.minute}
                  onChange={(e) =>
                    setDrafts((p) => ({ ...p, [m.id]: { ...d, minute: e.target.value } }))
                  }
                  placeholder="min"
                  className="w-14 rounded border border-border bg-surface px-2 py-1"
                />
                <select
                  value={d.kind}
                  onChange={(e) =>
                    setDrafts((p) => ({ ...p, [m.id]: { ...d, kind: e.target.value } }))
                  }
                  className="rounded border border-border bg-surface px-2 py-1"
                >
                  <option value="goal">goal</option>
                  <option value="penalty">penalty</option>
                  <option value="own_goal">own goal</option>
                </select>
                <button
                  onClick={() => addGoal(m)}
                  disabled={busy === m.id + "-goal"}
                  className="rounded-lg bg-pitch px-3 py-1.5 font-bold text-white disabled:opacity-50"
                >
                  + Goal
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
