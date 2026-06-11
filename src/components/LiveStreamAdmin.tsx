import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tv } from "lucide-react";

type LiveStream = { embed_url: string; title: string };

/** Admin control to set the Watch-page live stream (embed URL + title). */
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

  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setUrl(data.embed_url ?? "");
      setTitle(data.title ?? "");
    }
  }, [data]);

  async function save(nextUrl: string, nextTitle: string) {
    setSaving(true);
    const { error } = await (supabase as any)
      .from("live_stream")
      .update({ embed_url: nextUrl.trim(), title: nextTitle.trim() })
      .eq("id", true);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(nextUrl.trim() ? "Live stream updated" : "Live stream cleared");
    qc.invalidateQueries({ queryKey: ["live-stream"] });
  }

  return (
    <div className="rounded-3xl border border-border bg-surface p-6 shadow-card">
      <div className="flex items-center gap-2">
        <Tv className="size-5 text-primary" />
        <h2 className="font-display text-xl font-bold">Live Stream (Watch page)</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Paste an embed URL you are <strong>licensed</strong> to use — e.g. an official FIFA+ or
        broadcaster player. It shows on the Watch page for everyone. Leave blank to hide the player.
        Don&apos;t use unauthorized re-streams.
      </p>
      <div className="mt-4 space-y-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (e.g. Mexico vs South Africa)"
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://… embed URL"
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex gap-2">
          <button
            onClick={() => save(url, title)}
            disabled={saving}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {url && (
            <button
              onClick={() => {
                setUrl("");
                save("", title);
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
