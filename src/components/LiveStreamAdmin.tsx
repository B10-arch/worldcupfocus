import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tv } from "lucide-react";
import { Crest } from "@/components/Crest";
import { formatNPTDate } from "@/lib/time";
import { parseStreams, buildStreams, matchKey } from "@/lib/streams";

type AdminMatch = {
  id: string;
  kickoff_utc: string;
  status: string;
  team_a: { name: string | null; flag_emoji: string | null; code: string | null } | null;
  team_b: { name: string | null; flag_emoji: string | null; code: string | null } | null;
};

/**
 * Admin control to set a stream link per match. The Watch page automatically
 * plays the right link when that match kicks off. All links are stored in the
 * single live_stream.embed_url field (keyed by team codes), so no schema change
 * is needed.
 */
export function LiveStreamAdmin() {
  const qc = useQueryClient();
  const streamQ = useQuery({
    queryKey: ["live-stream"],
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("live_stream")
        .select("embed_url, title")
        .eq("id", true)
        .maybeSingle();
      return (data ?? { embed_url: "", title: "" }) as { embed_url: string; title: string };
    },
  });
  const matchesQ = useQuery({
    queryKey: ["admin-stream-matches"],
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("matches")
        .select(
          "id, kickoff_utc, status, team_a:teams!matches_team_a_id_fkey(name, flag_emoji, code), team_b:teams!matches_team_b_id_fkey(name, flag_emoji, code)",
        )
        .neq("status", "finished")
        .order("kickoff_utc", { ascending: true })
        .limit(24);
      return (data ?? []) as AdminMatch[];
    },
  });

  const [title, setTitle] = useState("");
  const [defaultUrl, setDefaultUrl] = useState("");
  const [links, setLinks] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const inited = useRef(false);

  // Prefill once from the stored value (keyed by team codes).
  useEffect(() => {
    if (inited.current || !streamQ.data || !matchesQ.data) return;
    const { byMatch, fallback } = parseStreams(streamQ.data.embed_url);
    setTitle(streamQ.data.title ?? "");
    setDefaultUrl(fallback.join(" "));
    const next: Record<string, string> = {};
    for (const m of matchesQ.data) {
      const u = byMatch.get(matchKey(m.team_a?.code, m.team_b?.code));
      if (u?.length) next[m.id] = u.join(" ");
    }
    setLinks(next);
    inited.current = true;
  }, [streamQ.data, matchesQ.data]);

  async function save() {
    setSaving(true);
    const perMatch = (matchesQ.data ?? []).map((m) => ({
      codeA: m.team_a?.code,
      codeB: m.team_b?.code,
      urls: links[m.id] ?? "",
    }));
    const embed = buildStreams(perMatch, defaultUrl);
    const { error } = await (supabase as any)
      .from("live_stream")
      .update({ embed_url: embed, title: title.trim() })
      .eq("id", true);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Stream links saved");
    qc.invalidateQueries({ queryKey: ["live-stream"] });
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="rounded-3xl border border-border bg-surface p-6 shadow-card">
      <div className="flex items-center gap-2">
        <Tv className="size-5 text-primary" />
        <h2 className="font-display text-xl font-bold">Live Streams (Watch page)</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Add a stream link per match — the Watch page automatically plays the right one when that
        match kicks off. Put two URLs (space-separated) for a primary + backup. The default link is
        used for any live match without its own link.
      </p>

      <div className="mt-4 space-y-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          className={inputClass}
        />
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Default stream (fallback, optional)
          </span>
          <input
            value={defaultUrl}
            onChange={(e) => setDefaultUrl(e.target.value)}
            placeholder="https://… used when a live match has no link of its own"
            className={inputClass}
          />
        </label>
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Per-match links
        </p>
        {matchesQ.isLoading && <p className="text-sm text-muted-foreground">Loading matches…</p>}
        {!matchesQ.isLoading && (matchesQ.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No upcoming matches.</p>
        )}
        {(matchesQ.data ?? []).map((m) => (
          <div
            key={m.id}
            className="flex flex-col gap-1.5 rounded-xl border border-border bg-background p-3 sm:flex-row sm:items-center sm:gap-3"
          >
            <div className="flex min-w-0 shrink-0 items-center gap-2 text-sm font-bold sm:w-52">
              <Crest src={m.team_a?.flag_emoji} size={18} />
              <span className="truncate">
                {m.team_a?.name ?? "TBD"} v {m.team_b?.name ?? "TBD"}
              </span>
              <Crest src={m.team_b?.flag_emoji} size={18} />
            </div>
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:w-24">
              {formatNPTDate(m.kickoff_utc)}
              {m.status === "live" ? " · LIVE" : ""}
            </span>
            <input
              value={links[m.id] ?? ""}
              onChange={(e) => setLinks((p) => ({ ...p, [m.id]: e.target.value }))}
              placeholder="https://… stream link (space-separate two for backup)"
              className={`${inputClass} flex-1`}
            />
          </div>
        ))}
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save all"}
      </button>
    </div>
  );
}
