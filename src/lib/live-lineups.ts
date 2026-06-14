import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Live lineups for the currently-live match, pulled from ESPN's free public API
// (no key, CORS-enabled). We anchor to the DB's live match so the lineup matches
// what's on the Watch stream, falling back to ESPN's first in-progress match.
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";

export type Player = {
  jersey: string;
  name: string;
  pos: string;
  starter: boolean;
  subbedIn: boolean;
  subbedOut: boolean;
  goals: number;
};
export type TeamLineup = {
  name: string;
  abbrev: string;
  logo: string;
  formation: string;
  score: string;
  starters: Player[];
  subs: Player[];
};
export type Lineups = { clock: string; home: TeamLineup; away: TeamLineup };

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

async function fetchLineups(): Promise<Lineups | null> {
  // Prefer the match the app has flagged live, so the lineup matches the stream.
  let preferred: string[] = [];
  try {
    const { data } = await (supabase as any)
      .from("matches")
      .select(
        "team_a:teams!matches_team_a_id_fkey(code), team_b:teams!matches_team_b_id_fkey(code)",
      )
      .eq("status", "live")
      .limit(1)
      .maybeSingle();
    if (data) {
      preferred = [data.team_a?.code, data.team_b?.code]
        .filter(Boolean)
        .map((c: string) => c.toUpperCase());
    }
  } catch {
    /* fall back to ESPN's live match */
  }

  const now = new Date();
  const range = `${ymd(new Date(now.getTime() - 864e5))}-${ymd(now)}`;
  const sb = await fetch(`${ESPN}/scoreboard?dates=${range}`).then((r) => r.json());
  const live = (sb.events ?? []).filter((e: any) => e.status?.type?.state === "in");
  if (!live.length) return null;

  const abbrevs = (e: any): string[] =>
    (e.competitions?.[0]?.competitors ?? []).map((c: any) =>
      (c.team?.abbreviation ?? "").toUpperCase(),
    );
  const ev =
    (preferred.length
      ? live.find((e: any) => {
          const a = abbrevs(e);
          return preferred.every((c) => a.includes(c));
        })
      : null) ?? live[0];

  const sum = await fetch(`${ESPN}/summary?event=${ev.id}`).then((r) => r.json());
  const rosters = sum.rosters;
  if (!Array.isArray(rosters) || rosters.length < 2) return null;

  // Goal scorers from key events (skip own goals).
  const goals: Record<string, number> = {};
  for (const k of sum.keyEvents ?? []) {
    const t = k.type?.text ?? "";
    if (/goal/i.test(t) && !/own/i.test(t)) {
      const scorer = k.athletesInvolved?.[0]?.displayName;
      if (scorer) goals[scorer] = (goals[scorer] ?? 0) + 1;
    }
  }

  const scoreByHA: Record<string, string> = {};
  for (const c of ev.competitions?.[0]?.competitors ?? []) {
    scoreByHA[c.homeAway] = String(c.score ?? "");
  }

  const parse = (r: any): TeamLineup => {
    const players: Player[] = (r.roster ?? []).map((p: any) => {
      const name = p.athlete?.displayName ?? "";
      return {
        jersey: String(p.jersey ?? ""),
        name,
        pos: p.position?.abbreviation ?? "",
        starter: !!p.starter,
        subbedIn: !!p.subbedIn,
        subbedOut: !!p.subbedOut,
        goals: goals[name] ?? 0,
      };
    });
    return {
      name: r.team?.displayName ?? "",
      abbrev: r.team?.abbreviation ?? "",
      logo: r.team?.logos?.[0]?.href ?? r.team?.logo ?? "",
      formation: r.formation ?? "",
      score: scoreByHA[r.homeAway] ?? "",
      starters: players.filter((p) => p.starter),
      subs: players.filter((p) => !p.starter && p.subbedIn),
    };
  };

  const home = rosters.find((r: any) => r.homeAway === "home");
  const away = rosters.find((r: any) => r.homeAway === "away");
  if (!home || !away) return null;

  return {
    clock: ev.status?.displayClock ?? "",
    home: parse(home),
    away: parse(away),
  };
}

export function useLiveLineups() {
  return useQuery({
    queryKey: ["live-lineups"],
    queryFn: fetchLineups,
    refetchInterval: 45_000, // live: pick up subs, goals, score
    retry: 1,
    staleTime: 30_000,
  });
}
