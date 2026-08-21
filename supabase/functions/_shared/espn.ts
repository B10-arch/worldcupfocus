// Shared ESPN feed helpers for the fixture/score sync functions.
//
// Every English competition we track lives on the same public ESPN scoreboard
// API, keyed by a league slug. One row in COMPETITIONS = one `matches.stage`
// value, so the app can tell a league game from a cup tie.

export type Competition = {
  slug: string; // ESPN league slug
  stage: string; // our matches.stage value
  label: string; // human label (used for group_name when there's no round info)
  gameweeks?: boolean; // derive GW1..GW38 round numbers (league only)
};

export const COMPETITIONS: Competition[] = [
  { slug: "eng.1", stage: "league", label: "Premier League", gameweeks: true },
  { slug: "eng.charity", stage: "community_shield", label: "Community Shield" },
  { slug: "eng.fa", stage: "fa_cup", label: "FA Cup" },
];

const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer";

export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/** Fetch every event ESPN lists for a competition across a date range. */
export async function fetchEvents(slug: string, from: Date, to: Date): Promise<any[]> {
  const url = `${SCOREBOARD}/${slug}/scoreboard?dates=${ymd(from)}-${ymd(to)}&limit=1000`;
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j.events) ? j.events : [];
  } catch {
    return []; // a single competition failing must not abort the whole sync
  }
}

/** Normalize a club name: lowercase, strip accents, drop non-alphanumerics. */
export function norm(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// ESPN spelling (normalized) -> our team name (normalized), for the handful of
// clubs whose feed name differs from our seed data.
const ALIASES: Record<string, string> = {
  bournemouth: "afcbournemouth",
  brightonhovealbion: "brightonhovealbion",
  manchesterutd: "manchesterunited",
  newcastle: "newcastleunited",
  nottmforest: "nottinghamforest",
  spurs: "tottenhamhotspur",
  tottenham: "tottenhamhotspur",
  wolves: "wolverhamptonwanderers",
  leeds: "leedsunited",
  hull: "hullcity",
  coventry: "coventrycity",
  ipswich: "ipswichtown",
  sheffieldutd: "sheffieldunited",
  westbrom: "westbromwichalbion",
  qpr: "queensparkrangers",
};

/** The ESPN team id baked into a crest URL (.../soccer/500/<id>.png). */
export function espnIdFromCrest(url: string | null | undefined): string | null {
  const m = String(url ?? "").match(/\/soccer\/\d+\/(\d+)\.png/i);
  return m ? m[1] : null;
}

export type TeamRow = { id: string; code: string; name: string; flag_emoji: string | null };

/**
 * Resolves an ESPN competitor to one of our `teams` rows, creating a row for
 * unknown clubs (lower-league FA Cup opponents) so cup ties still render with a
 * name and badge. Created clubs get group_name 'CUP' — the league table, the
 * clubs page and the pick list all filter on group_name = 'PL', so they stay out.
 */
export class TeamResolver {
  private byEspnId = new Map<string, string>();
  private byName = new Map<string, string>();
  private codes = new Set<string>();
  created: string[] = [];

  constructor(
    private supabase: any,
    teams: TeamRow[],
  ) {
    for (const t of teams) {
      const espnId = espnIdFromCrest(t.flag_emoji);
      if (espnId) this.byEspnId.set(espnId, t.id);
      this.byName.set(norm(t.name), t.id);
      this.codes.add(String(t.code).toUpperCase());
    }
  }

  /** Look up only — never creates. Used by the score sync. */
  find(team: any): string | null {
    const espnId = String(team?.id ?? "");
    if (espnId && this.byEspnId.has(espnId)) return this.byEspnId.get(espnId)!;
    const n = norm(team?.displayName ?? team?.name ?? "");
    if (this.byName.has(n)) return this.byName.get(n)!;
    const aliased = ALIASES[n];
    if (aliased && this.byName.has(aliased)) return this.byName.get(aliased)!;
    return null;
  }

  /** Look up, inserting a 'CUP' club row when the opponent is unknown to us. */
  async findOrCreate(team: any): Promise<string | null> {
    const existing = this.find(team);
    if (existing) return existing;

    const name = String(team?.displayName ?? team?.name ?? "").trim();
    if (!name) return null;

    const { data, error } = await this.supabase
      .from("teams")
      .insert({
        code: this.freeCode(team?.abbreviation, name),
        name,
        flag_emoji: team?.logo ?? "⚽",
        group_name: "CUP",
      })
      .select("id")
      .single();
    if (error || !data) return null;

    const espnId = String(team?.id ?? "");
    if (espnId) this.byEspnId.set(espnId, data.id);
    this.byName.set(norm(name), data.id);
    this.created.push(name);
    return data.id;
  }

  /** A short code that isn't taken yet (teams.code is UNIQUE). */
  private freeCode(abbr: string | undefined, name: string): string {
    const base = (abbr || name).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3) || "CLB";
    if (!this.codes.has(base)) {
      this.codes.add(base);
      return base;
    }
    for (let i = 2; i < 100; i++) {
      const candidate = `${base.slice(0, 2)}${i}`;
      if (!this.codes.has(candidate)) {
        this.codes.add(candidate);
        return candidate;
      }
    }
    return base + Math.floor(Math.random() * 1000); // effectively unreachable
  }
}

/** home/away competitors of an ESPN event, or null if the feed row is malformed. */
export function sidesOf(ev: any): { home: any; away: any; comp: any } | null {
  const comp = ev?.competitions?.[0];
  const competitors: any[] = comp?.competitors ?? [];
  const home = competitors.find((c) => c.homeAway === "home");
  const away = competitors.find((c) => c.homeAway === "away");
  if (!home || !away) return null;
  return { home, away, comp };
}

/** 'pre' | 'in' | 'post' from an ESPN event. */
export function stateOf(ev: any): string {
  return ev?.status?.type?.state ?? ev?.competitions?.[0]?.status?.type?.state ?? "pre";
}

/**
 * Assign gameweek numbers to a league season. ESPN's scoreboard carries no round
 * field, so we walk fixtures in kickoff order and drop each into the lowest round
 * that doesn't already contain either club — which reproduces the official 1..38
 * numbering for a full 380-fixture list and degrades sensibly around rearranged
 * midweek games.
 */
export function assignGameweeks(events: any[]): Map<string, number> {
  const out = new Map<string, number>();
  const rounds: Set<string>[] = [];
  const sorted = [...events].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  for (const ev of sorted) {
    const sides = sidesOf(ev);
    if (!sides) continue;
    const ids = [String(sides.home.team?.id), String(sides.away.team?.id)];
    let placed = false;
    for (let i = 0; i < rounds.length; i++) {
      const r = rounds[i];
      if (r.size < 20 && !ids.some((id) => r.has(id))) {
        ids.forEach((id) => r.add(id));
        out.set(String(ev.id), i + 1);
        placed = true;
        break;
      }
    }
    if (!placed) {
      rounds.push(new Set(ids));
      out.set(String(ev.id), rounds.length);
    }
  }
  return out;
}

/** Round label for a cup tie ("Third Round", "Final", …) when the feed has one. */
export function roundLabel(ev: any, fallback: string): string {
  const notes: any[] = ev?.competitions?.[0]?.notes ?? [];
  const headline = notes.find((n) => n?.headline)?.headline;
  return String(headline || ev?.season?.type?.name || fallback).slice(0, 60);
}
