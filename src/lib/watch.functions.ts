import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { allConfiguredUrls } from "@/lib/streams";

// Server-side preflight for the Watch player. The browser can't check a
// cross-origin stream URL (CORS hides status/headers), so this runs on the
// server: given the candidate feeds (the live match's link + the default), it
// probes each and returns them ordered with the working ones first — so the
// player automatically falls back to the default when a match's own link is
// gone or can't be embedded.
//
// Conservative on purpose: only DEFINITIVE failures demote a feed (404/410/451,
// or X-Frame-Options deny/sameorigin). 403/5xx/timeout are left as-is, because
// pirate stream hosts often block datacenter IPs — we don't want a false
// negative to drop a link that actually works in the viewer's browser. The
// manual "Switch feed" button covers anything this can't detect (e.g. a page
// that loads but whose video is dead).

const GONE = new Set([404, 410, 451]);

export const orderStreams = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ feeds: z.array(z.string()).max(8) }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const requested = data.feeds.filter((f) => /^https?:\/\//.test(f));
    if (requested.length <= 1) return requested;

    // Only probe URLs that are actually configured (don't act as an open proxy).
    const { data: ls } = await (supabase as any)
      .from("live_stream")
      .select("embed_url")
      .eq("id", true)
      .maybeSingle();
    const allowed = new Set(allConfiguredUrls(ls?.embed_url ?? ""));
    const feeds = requested.filter((f) => allowed.has(f));
    if (feeds.length <= 1) return feeds;

    const checks = await Promise.all(
      feeds.map(async (u) => {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 6000);
          const res = await fetch(u, {
            method: "GET",
            redirect: "follow",
            signal: ctrl.signal,
            headers: { "user-agent": "Mozilla/5.0" },
          });
          clearTimeout(timer);
          const xfo = (res.headers.get("x-frame-options") ?? "").toLowerCase();
          const unframeable = xfo.includes("deny") || xfo.includes("sameorigin");
          // "broken" only for definitive failures; everything else stays usable.
          const broken = GONE.has(res.status) || unframeable;
          return { u, ok: !broken };
        } catch {
          return { u, ok: true }; // timeout / network — keep (could be IP-blocking)
        }
      }),
    );
    const ok = checks.filter((c) => c.ok).map((c) => c.u);
    const bad = checks.filter((c) => !c.ok).map((c) => c.u);
    return [...ok, ...bad];
  });
