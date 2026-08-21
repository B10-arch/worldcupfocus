// Seed / refresh the full fixture list for every competition we track:
// Premier League (all 380), the Community Shield, and the FA Cup.
//
// Idempotent — safe to re-run. Each match row is keyed by its ESPN event id, so
// re-running updates kickoff times and venues in place rather than duplicating.
// Rows created before this function existed (the hand-loaded GW1) are adopted by
// matching on team pair + kickoff day and then stamped with their event id.
//
// FA Cup rounds involving Premier League clubs are only published by the feed a
// few weeks ahead, so run this periodically (weekly cron is plenty) — new rounds
// appear as ESPN releases them.
//
// Deployed with --no-verify-jwt. If SYNC_SECRET is set, callers must pass it via
// the `x-sync-secret` header (or `?key=`).
//
// Query params:
//   ?dry=1   report what would change without writing

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  COMPETITIONS,
  TeamResolver,
  assignGameweeks,
  fetchEvents,
  roundLabel,
  sidesOf,
  stateOf,
} from "../_shared/espn.ts";

// A season runs Aug -> May; pull a wide window so both halves are covered
// whichever side of New Year we run on.
function seasonWindow(now: Date): { from: Date; to: Date } {
  const y = now.getUTCFullYear();
  const startYear = now.getUTCMonth() >= 5 ? y : y - 1; // June onwards = new season
  return {
    from: new Date(Date.UTC(startYear, 5, 1)), // 1 June
    to: new Date(Date.UTC(startYear + 1, 6, 31)), // 31 July next year
  };
}

const dayOf = (iso: string) => String(iso).slice(0, 10);
const pairKey = (a: string, b: string) => [a, b].sort().join("|");

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const secret = Deno.env.get("SYNC_SECRET");
  if (secret) {
    const provided = req.headers.get("x-sync-secret") ?? url.searchParams.get("key");
    if (provided !== secret) return new Response("forbidden", { status: 403 });
  }
  const dry = url.searchParams.get("dry") === "1";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: teams, error: teamsErr } = await supabase
    .from("teams")
    .select("id, code, name, flag_emoji");
  if (teamsErr) return Response.json({ ok: false, error: teamsErr.message }, { status: 500 });
  const resolver = new TeamResolver(supabase, teams ?? []);

  // Existing rows, indexed by event id and (as a fallback for pre-existing rows)
  // by team pair + kickoff day.
  const { data: existing, error: matchErr } = await supabase
    .from("matches")
    .select("id, espn_event_id, team_a_id, team_b_id, kickoff_utc, stage, group_name, venue");
  if (matchErr) {
    return Response.json(
      {
        ok: false,
        error: matchErr.message,
        hint: "Run the 20260816000000_all_competitions.sql migration first — it adds matches.espn_event_id.",
      },
      { status: 500 },
    );
  }
  const byEventId = new Map<string, any>();
  const byPairDay = new Map<string, any>();
  for (const m of existing ?? []) {
    if (m.espn_event_id) byEventId.set(String(m.espn_event_id), m);
    if (m.team_a_id && m.team_b_id) {
      byPairDay.set(`${pairKey(m.team_a_id, m.team_b_id)}@${dayOf(m.kickoff_utc)}`, m);
    }
  }

  const { from, to } = seasonWindow(new Date());
  const report: Record<string, { seen: number; inserted: number; updated: number }> = {};
  const skipped: string[] = [];

  for (const comp of COMPETITIONS) {
    const events = await fetchEvents(comp.slug, from, to);
    const gameweeks = comp.gameweeks ? assignGameweeks(events) : new Map<string, number>();
    const stat = { seen: events.length, inserted: 0, updated: 0 };
    report[comp.stage] = stat;

    for (const ev of events) {
      const sides = sidesOf(ev);
      if (!sides) continue;

      const homeId = await resolver.findOrCreate(sides.home.team);
      const awayId = await resolver.findOrCreate(sides.away.team);
      const label = `${sides.home.team?.displayName ?? "?"} v ${sides.away.team?.displayName ?? "?"}`;
      if (!homeId || !awayId) {
        skipped.push(`${comp.stage}: could not resolve teams for ${label}`);
        continue;
      }

      const gw = gameweeks.get(String(ev.id));
      const row = {
        // team_a is the home side throughout the app.
        team_a_id: homeId,
        team_b_id: awayId,
        kickoff_utc: new Date(ev.date).toISOString(),
        stage: comp.stage,
        group_name: gw ? `GW${gw}` : roundLabel(ev, comp.label),
        venue: sides.comp?.venue?.fullName ?? ev?.venue?.displayName ?? null,
        // ESPN publishes a placeholder 00:00 kickoff for fixtures whose time is
        // not confirmed; surface those under the page's "Time TBC" section.
        time_tbc: stateOf(ev) === "pre" && String(ev.date).slice(11, 16) === "00:00",
        espn_event_id: String(ev.id),
      };

      const prior =
        byEventId.get(String(ev.id)) ??
        byPairDay.get(`${pairKey(homeId, awayId)}@${dayOf(ev.date)}`);

      if (prior) {
        // Never touch score/status here — that is the score sync's job.
        if (!dry) {
          const { error } = await supabase.from("matches").update(row).eq("id", prior.id);
          if (error) {
            skipped.push(`${comp.stage}: update failed ${label}: ${error.message}`);
            continue;
          }
        }
        stat.updated++;
      } else {
        if (!dry) {
          const { error } = await supabase.from("matches").insert({ ...row, status: "scheduled" });
          if (error) {
            skipped.push(`${comp.stage}: insert failed ${label}: ${error.message}`);
            continue;
          }
        }
        stat.inserted++;
      }
    }
  }

  return Response.json({
    ok: true,
    dry,
    window: { from: from.toISOString(), to: to.toISOString() },
    competitions: report,
    clubs_created: resolver.created,
    skipped,
    at: new Date().toISOString(),
  });
});
