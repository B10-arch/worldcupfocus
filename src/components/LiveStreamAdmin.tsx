import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tv } from "lucide-react";

type LiveStream = { embed_url: string; title: string };

/**
 * Admin control for the Watch-page live stream. Stores a primary + optional
 * backup embed URL (one per line) in the single embed_url field, so viewers can
 * switch feeds if the primary isn't loading — no schema change needed.
 */
export function LiveStreamAdmin() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["live-stream"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("live_stream")
        .select("embed_url, title")
        .eq("id", true)
        .maybeSingle();
      return (data ?? { embed_url: "", title: "" }) as LiveStream;
    },
  });

  const [primary, setPrimary] = useState("");
  const [backup, setBackup] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      const lines = (data.embed_url ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      setPrimary(lines[0] ?? "");
      setBackup(lines[1] ?? "");
      setTitle(data.title ?? "");
    }
  }, [data]);

  // Pull clean http(s) URLs out of a field, even if two got pasted together
  // (split on whitespace and on each "http(s)://" boundary).
  const urlsOf = (s: string) =>
    s
      .split(/\s+|(?=https?:\/\/)/)
      .map((x) => x.trim())
      .filter((x) => /^https?:\/\//.test(x));

  async function save(p: string, b: string, nextTitle: string) {
    const combined = [...new Set([...urlsOf(p), ...urlsOf(b)])].join("\n");
    setSaving(true);
    const { error } = await (supabase as any)
      .from("live_stream")
      .update({ embed_url: combined, title: nextTitle.trim() })
      .eq("id", true);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(combined ? "Live stream updated" : "Live stream cleared");
    qc.invalidateQueries({ queryKey: ["live-stream"] });
  }

  const inputClass =
    "w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="rounded-3xl border border-border bg-surface p-6 shadow-card">
      <div className="flex items-center gap-2">
        <Tv className="size-5 text-primary" />
        <h2 className="font-display text-xl font-bold">Live Stream (Watch page)</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Paste an embed URL you are <strong>licensed</strong> to use — e.g. an official FIFA+ or
        broadcaster player. Add a <strong>backup URL</strong> too; viewers can switch to it on the
        Watch page if the primary isn&apos;t loading. Leave both blank to hide the player.
      </p>
      <div className="mt-4 space-y-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (e.g. Spain vs Cape Verde)"
          className={inputClass}
        />
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Primary stream URL
          </span>
          <input
            value={primary}
            onChange={(e) => setPrimary(e.target.value)}
            placeholder="https://… primary embed URL"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Backup stream URL (optional)
          </span>
          <input
            value={backup}
            onChange={(e) => setBackup(e.target.value)}
            placeholder="https://… backup embed URL"
            className={inputClass}
          />
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => save(primary, backup, title)}
            disabled={saving}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {(primary || backup) && (
            <button
              onClick={() => {
                setPrimary("");
                setBackup("");
                save("", "", title);
              }}
              disabled={saving}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold transition hover:bg-secondary disabled:opacity-50"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
