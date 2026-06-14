import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PlayCircle } from "lucide-react";

type AdminMatch = {
  id: string;
  status: string;
  kickoff_utc: string;
  score_a: number | null;
  score_b: number | null;
  highlights_url: string | null;
  team_a: { name: string | null; flag_emoji: string | null } | null;
  team_b: { name: string | null; flag_emoji: string | null } | null;
};

/**
 * Admin control to set a highlights video URL per finished match. The dashboard
 * Match Center embeds whatever is set here in the Highlights popup; blank falls
 * back to a YouTube search link. Paste a real-footage clip you've confirmed plays
 * in your region (official broadcaster clips are often geo-locked; verify first).
 */
export function MatchHighlightsAdmin() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-match-highlights"],
    retry: false,
    queryFn: async () => {
      // Show every match that has kicked off (played or in-progress) — not just
      // status='finished', so a game whose status hasn't synced yet is still
      // settable. Newest first.
      const { data, error } = await (supabase as any)
        .from("matches")
        .select(
          "id, status, kickoff_utc, score_a, score_b, highlights_url, team_a:teams!matches_team_a_id_fkey(name, flag_emoji), team_b:teams!matches_team_b_id_fkey(name, flag_emoji)",
        )
        .lte("kickoff_utc", new Date().toISOString())
        .order("kickoff_utc", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdminMatch[];
    },
  });

  const missingColumn = /highlights_url/.test((error as Error | null)?.message ?? "");

  // Local edits keyed by match id; falls back to the saved value when untouched.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  async function save(id: string, url: string) {
    setSavingId(id);
    const { error } = await (supabase as any)
      .from("matches")
      .update({ highlights_url: url.trim() })
      .eq("id", id);
    setSavingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(url.trim() ? "Highlights saved" : "Highlights cleared");
    setEdits((e) => {
      const next = { ...e };
      delete next[id];
      return next;
    });
    qc.invalidateQueries({ queryKey: ["admin-match-highlights"] });
    qc.invalidateQueries({ queryKey: ["matches"] });
  }

  return (
    <div className="rounded-3xl border border-border bg-surface p-6 shadow-card">
      <div className="flex items-center gap-2">
        <PlayCircle className="size-5 text-primary" />
        <h2 className="font-display text-xl font-bold">Match Highlights</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Paste a highlights video URL (YouTube link or embed) for each played match — it shows in the
        Match Center popup. <strong>Verify it&apos;s real footage and plays in your region</strong>{" "}
        before saving; official broadcaster clips (FOX, etc.) are often geo-locked. Leave blank to
        fall back to a YouTube search link.
      </p>

      {error && (
        <div className="mt-4 rounded-xl border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
          {missingColumn ? (
            <>
              <strong className="text-foreground">In-app editing isn&apos;t enabled yet.</strong>{" "}
              Highlights are currently managed in code and already show on the Dashboard and Matches
              pages. To edit them here, add the <code>highlights_url</code> column by running{" "}
              <code>supabase/migrations/20260612020000_match_highlights.sql</code> in the Supabase
              SQL Editor, then refresh. (Until then, just tell Claude which video to use per match.)
            </>
          ) : (
            <>Couldn&apos;t load matches: {(error as Error).message}</>
          )}
        </div>
      )}

      <div className="mt-4 space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Loading matches…</p>}
        {!isLoading && !error && (data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No matches have kicked off yet.</p>
        )}
        {(data ?? []).map((m) => {
          const saved = m.highlights_url ?? "";
          const value = edits[m.id] ?? saved;
          const dirty = value.trim() !== saved.trim();
          return (
            <div
              key={m.id}
              className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3 md:flex-row md:items-center"
            >
              <div className="flex min-w-0 shrink-0 items-center gap-2 text-sm font-bold md:w-56">
                <span>{m.team_a?.flag_emoji ?? "🏳️"}</span>
                <span className="truncate">
                  {m.team_a?.name ?? "TBD"} vs {m.team_b?.name ?? "TBD"}
                </span>
                <span>{m.team_b?.flag_emoji ?? "🏳️"}</span>
                {m.score_a != null && m.score_b != null && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {m.score_a}–{m.score_b}
                  </span>
                )}
              </div>
              <input
                value={value}
                onChange={(e) => setEdits((prev) => ({ ...prev, [m.id]: e.target.value }))}
                placeholder="https://youtube.com/watch?v=…"
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => save(m.id, value)}
                  disabled={savingId === m.id || !dirty}
                  className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
                >
                  {savingId === m.id ? "Saving…" : "Save"}
                </button>
                {saved && (
                  <button
                    onClick={() => save(m.id, "")}
                    disabled={savingId === m.id}
                    className="rounded-lg border border-border px-3 py-2 text-sm font-semibold transition hover:bg-secondary disabled:opacity-50"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
