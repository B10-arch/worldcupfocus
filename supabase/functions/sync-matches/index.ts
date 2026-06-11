// Sync World Cup match results from ESPN's public feed into the `matches` table,
// then recompute pool points. Idempotent — safe to run every few minutes.
//
// Invoked by pg_cron (see setup) on a schedule. Reads the ESPN scoreboard for a
// small window of dates, maps each match to our group-stage rows by team pair,
// and updates score/status/winner. Knockout rows (no teams assigned yet) are
// skipped until the bracket is populated.
//
// Deployed with --no-verify-jwt. If the SYNC_SECRET env var is set, callers must
// pass it via the `x-sync-secret` header (or `?key=`); otherwise open (harmless —
// it only mirrors public results and is idempotent).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ESPN_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";

// Normalize a country name: lowercase, strip accents, drop non-alphanumerics.
function norm(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// ESPN spelling (normalized) -> our team name (normalized). Covers the names
// that differ between the feed and our seed data.
const ALIASES: Record<string, string> = {
  turkey: "turkiye",
  cotedivoire: "ivorycoast",
  czechrepublic: "czechia",
  usa: "unitedstates",
  unitedstatesofamerica: "unitedstates",
  congodr: "drcongo",
  drcongo: "drcongo",
  democraticrepublicofcongo: "drcongo",
  caboverde: "capeverde",
  southkorea: "southkorea",
  korearepublic: "southkorea",
  republicofkorea: "southkorea",
  bosniaherzegovina: "bosniaandherzegovina",
  iranislamicrepublic: "iran",
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("SYNC_SECRET");
  if (secret) {
    const url = new URL(req.url);
    const provided = req.headers.get("x-sync-secret") ?? url.searchParams.get("key");
    if (provided !== secret) return new Response("forbidden", { status: 403 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1. Resolver: normalized team name (incl. aliases) -> our team id.
  const { data: teams, error: teamsErr } = await supabase.from("teams").select("id, name");
  if (teamsErr) return Response.json({ ok: false, error: teamsErr.message }, { status: 500 });
  const nameToId = new Map<string, string>();
  for (const t of teams ?? []) nameToId.set(norm(t.name), t.id);
  const resolve = (espnName: string): string | null => {
    const n = norm(espnName);
    if (nameToId.has(n)) return nameToId.get(n)!;
    const aliased = ALIASES[n];
    if (aliased && nameToId.has(aliased)) return nameToId.get(aliased)!;
    return null;
  };

  // 2. Index our matches that have both teams (group stage) by unordered pair.
  const { data: matches, error: matchErr } = await supabase
    .from("matches")
    .select("id, team_a_id, team_b_id, status")
    .not("team_a_id", "is", null)
    .not("team_b_id", "is", null);
  if (matchErr) return Response.json({ ok: false, error: matchErr.message }, { status: 500 });
  const pairKey = (a: string, b: string) => [a, b].sort().join("|");
  const byPair = new Map<string, { id: string; team_a_id: string; team_b_id: string; status: string }>();
  for (const m of matches ?? []) byPair.set(pairKey(m.team_a_id, m.team_b_id), m);

  // 3. Pull ESPN for a small window (yesterday..tomorrow UTC) to catch
  //    just-finished, live, and same-day matches across timezones.
  const now = new Date();
  const dates = [-1, 0, 1].map((off) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + off);
    return ymd(d);
  });
  const events: any[] = [];
  for (const d of dates) {
    try {
      const r = await fetch(`${ESPN_URL}?dates=${d}`);
      if (r.ok) {
        const j = await r.json();
        if (Array.isArray(j.events)) events.push(...j.events);
      }
    } catch (_) {
      // ignore a single failed day fetch
    }
  }

  // 4. Map + update.
  let updated = 0;
  const skipped: string[] = [];
  for (const ev of events) {
    const comp = ev?.competitions?.[0];
    const competitors: any[] = comp?.competitors ?? [];
    const home = competitors.find((c) => c.homeAway === "home");
    const away = competitors.find((c) => c.homeAway === "away");
    if (!home || !away) continue;

    const homeId = resolve(home.team?.displayName ?? home.team?.name ?? "");
    const awayId = resolve(away.team?.displayName ?? away.team?.name ?? "");
    const label = `${away.team?.displayName ?? "?"} v ${home.team?.displayName ?? "?"}`;
    if (!homeId || !awayId) {
      skipped.push(`unmapped teams: ${label}`);
      continue;
    }
    const m = byPair.get(pairKey(homeId, awayId));
    if (!m) {
      skipped.push(`no match row (likely knockout TBD): ${label}`);
      continue;
    }

    const state: string = ev?.status?.type?.state ?? comp?.status?.type?.state ?? "pre";
    if (state === "pre") continue; // not started — nothing to update

    const status = state === "post" ? "finished" : "live";
    const homeScore = Number(home.score ?? 0);
    const awayScore = Number(away.score ?? 0);
    // Orient scores to our team_a/team_b.
    const scoreA = m.team_a_id === homeId ? homeScore : awayScore;
    const scoreB = m.team_a_id === homeId ? awayScore : homeScore;

    let winnerTeamId: string | null = null;
    if (state === "post") {
      if (home.winner === true) winnerTeamId = homeId;
      else if (away.winner === true) winnerTeamId = awayId;
      else if (homeScore !== awayScore) winnerTeamId = homeScore > awayScore ? homeId : awayId;
    }

    const { error: upErr } = await supabase
      .from("matches")
      .update({ score_a: scoreA, score_b: scoreB, status, winner_team_id: winnerTeamId })
      .eq("id", m.id);
    if (upErr) {
      skipped.push(`update failed ${label}: ${upErr.message}`);
      continue;
    }
    updated++;
  }

  // 5. Recompute pool points from finished results.
  const { error: rpcErr } = await supabase.rpc("recompute_points");

  return Response.json({
    ok: true,
    events_seen: events.length,
    updated,
    skipped,
    recompute_error: rpcErr?.message ?? null,
    at: new Date().toISOString(),
  });
});
