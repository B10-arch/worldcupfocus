// Sync live scores/status from ESPN's public feed into the `matches` table, then
// recompute pool points. Idempotent — safe to run every few minutes.
//
// Covers every competition in COMPETITIONS (Premier League, Community Shield,
// FA Cup). Only rows that already exist are updated — creating fixtures is
// sync-fixtures' job — so a match missing here means the fixture list is stale.
//
// Invoked by pg_cron (see 20260611180000_match_sync_cron.sql). Reads a small
// window of dates, matches each event to our row by ESPN event id (falling back
// to team pair for rows seeded before event ids existed), and updates
// score/status/winner.
//
// Deployed with --no-verify-jwt. If the SYNC_SECRET env var is set, callers must
// pass it via the `x-sync-secret` header (or `?key=`); otherwise open (harmless —
// it only mirrors public results and is idempotent).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  COMPETITIONS,
  TeamResolver,
  fetchEvents,
  fetchGoals,
  sidesOf,
  stateOf,
  type Competition,
} from "../_shared/espn.ts";

const pairKey = (a: string, b: string) => [a, b].sort().join("|");

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

  // 1. Resolver: ESPN team (id or name) -> our team id. Look-up only here.
  const { data: teams, error: teamsErr } = await supabase
    .from("teams")
    .select("id, code, name, flag_emoji");
  if (teamsErr) return Response.json({ ok: false, error: teamsErr.message }, { status: 500 });
  const resolver = new TeamResolver(supabase, teams ?? []);

  // 2. Index our matches by ESPN event id, and by unordered team pair as a
  //    fallback for rows that predate the event id column.
  const { data: matches, error: matchErr } = await supabase
    .from("matches")
    .select("id, espn_event_id, team_a_id, team_b_id, status")
    .not("team_a_id", "is", null)
    .not("team_b_id", "is", null);
  if (matchErr) return Response.json({ ok: false, error: matchErr.message }, { status: 500 });
  const byEventId = new Map<string, any>();
  const byPair = new Map<string, any>();
  for (const m of matches ?? []) {
    if (m.espn_event_id) byEventId.set(String(m.espn_event_id), m);
    byPair.set(pairKey(m.team_a_id, m.team_b_id), m);
  }

  // 3. Pull each competition for yesterday..tomorrow UTC, to catch just-finished,
  //    live, and same-day matches across timezones.
  const now = new Date();
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() + 1);

  const events: { comp: Competition; ev: any }[] = [];
  for (const comp of COMPETITIONS) {
    for (const ev of await fetchEvents(comp.slug, from, to)) events.push({ comp, ev });
  }

  // 4. Map + update.
  let updated = 0;
  let goalsWritten = 0;
  const skipped: string[] = [];
  for (const { comp, ev } of events) {
    const sides = sidesOf(ev);
    if (!sides) continue;
    const { home, away } = sides;

    const homeId = resolver.find(home.team);
    const awayId = resolver.find(away.team);
    const label = `${away.team?.displayName ?? "?"} at ${home.team?.displayName ?? "?"}`;
    if (!homeId || !awayId) {
      skipped.push(`unmapped teams: ${label}`);
      continue;
    }

    const m = byEventId.get(String(ev.id)) ?? byPair.get(pairKey(homeId, awayId));
    if (!m) {
      skipped.push(`no match row (run sync-fixtures): ${label}`);
      continue;
    }

    const state = stateOf(ev);
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
      .update({
        score_a: scoreA,
        score_b: scoreB,
        status,
        winner_team_id: winnerTeamId,
        // Adopt the event id so future runs match exactly, not just by pair.
        espn_event_id: String(ev.id),
      })
      .eq("id", m.id);
    if (upErr) {
      skipped.push(`update failed ${label}: ${upErr.message}`);
      continue;
    }
    updated++;

    // Goals for this match. ESPN is treated as the source of truth: the match's
    // existing events are replaced wholesale, which keeps re-runs idempotent
    // without needing a unique constraint on match_events. Any goals typed by
    // hand for this match are superseded.
    try {
      const goals = await fetchGoals(comp.slug, String(ev.id));
      if (goals.length) {
        await supabase.from("match_events").delete().eq("match_id", m.id);
        const rows = goals.map((g) => ({
          match_id: m.id,
          team_id: g.espnTeamId ? resolver.find({ id: g.espnTeamId }) : null,
          kind: g.kind,
          minute: g.minute,
          scorer: g.scorer,
          assist: g.assist,
        }));
        const { error: gErr } = await supabase.from("match_events").insert(rows);
        if (gErr) skipped.push(`goals failed ${label}: ${gErr.message}`);
        else goalsWritten += rows.length;
      }
    } catch (e) {
      skipped.push(`goals errored ${label}: ${String(e)}`);
    }
  }

  // 5. Recompute pool points from finished results (league fixtures only).
  const { error: rpcErr } = await supabase.rpc("recompute_points");

  return Response.json({
    ok: true,
    events_seen: events.length,
    updated,
    goals_written: goalsWritten,
    skipped,
    recompute_error: rpcErr?.message ?? null,
    at: new Date().toISOString(),
  });
});
