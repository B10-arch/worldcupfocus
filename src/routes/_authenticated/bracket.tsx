import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatNPTDate } from "@/lib/time";
import { Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/bracket")({
  head: () => ({ meta: [{ title: "Bracket · Focus World Cup Pool" }] }),
  component: BracketPage,
});

type Team = { id: string; name: string | null; code: string | null; flag_emoji: string | null };
type Match = {
  id: string;
  stage: string;
  kickoff_utc: string;
  status: string;
  score_a: number | null;
  score_b: number | null;
  winner_team_id: string | null;
  team_a_id: string | null;
  team_b_id: string | null;
  team_a: Team | null;
  team_b: Team | null;
};

// flagcdn gives a real flag image we can crop into a circle (emoji flags can't
// be). Most teams' ISO-2 code is encoded in their flag emoji; the few that use a
// subdivision flag (England/Scotland/Wales) need an explicit code.
const ISO_OVERRIDE: Record<string, string> = { ENG: "gb-eng", SCO: "gb-sct", WAL: "gb-wls" };
function flagImg(team: Team | null): string | null {
  if (!team) return null;
  const o = team.code ? ISO_OVERRIDE[team.code] : undefined;
  if (o) return `https://flagcdn.com/w160/${o}.png`;
  const cps = Array.from(team.flag_emoji ?? "");
  if (cps.length === 2) {
    const a = cps[0].codePointAt(0)!;
    const b = cps[1].codePointAt(0)!;
    if (a >= 0x1f1e6 && a <= 0x1f1ff && b >= 0x1f1e6 && b <= 0x1f1ff) {
      const iso = (
        String.fromCharCode(65 + a - 0x1f1e6) + String.fromCharCode(65 + b - 0x1f1e6)
      ).toLowerCase();
      return `https://flagcdn.com/w160/${iso}.png`;
    }
  }
  return null;
}

const STAGES = [
  { key: "r16", label: "Round of 16" },
  { key: "qf", label: "Quarter-Finals" },
  { key: "sf", label: "Semi-Finals" },
  { key: "third", label: "Third Place" },
  { key: "final", label: "Final" },
] as const;

function BracketPage() {
  const { data: matches } = useQuery({
    queryKey: ["bracket"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("matches")
        .select("*, team_a:teams!matches_team_a_id_fkey(*), team_b:teams!matches_team_b_id_fkey(*)")
        .neq("stage", "group")
        .order("kickoff_utc");
      return (data ?? []) as Match[];
    },
  });

  const r32 = (matches ?? []).filter((m) => m.stage === "r32");
  const left = r32.slice(0, 8);
  const right = r32.slice(8, 16);

  return (
    <div className="space-y-8">
      {/* ---- Round of 32: the showcase bracket ---- */}
      <div
        className="overflow-hidden rounded-3xl border border-amber-400/30 p-5 shadow-card md:p-8"
        style={{
          backgroundImage:
            "radial-gradient(120% 80% at 50% 0%, #4a3a12 0%, #2a2008 45%, #1a1405 100%)",
        }}
      >
        <header className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-amber-300/80">
            2026 FIFA World Cup
          </p>
          <h1 className="mt-1 font-display text-4xl font-extrabold uppercase tracking-tight text-white md:text-5xl">
            Knockouts
          </h1>
          <p className="mt-1 text-xs font-bold uppercase tracking-[0.3em] text-amber-300">
            Round of 32
          </p>
        </header>

        <div className="mt-8 grid grid-cols-1 items-center gap-8 lg:grid-cols-[1fr_auto_1fr] lg:gap-4">
          <div className="space-y-4">
            {[0, 2, 4, 6].map((i) => (
              <Pair key={i} a={left[i]} b={left[i + 1]} side="left" />
            ))}
          </div>

          <div className="flex items-center justify-center py-2 lg:py-0">
            <div className="flex size-28 items-center justify-center rounded-full border-2 border-amber-400/40 bg-amber-400/10 shadow-glow md:size-36">
              <Trophy className="size-14 text-amber-300 md:size-20" />
            </div>
          </div>

          <div className="space-y-4">
            {[0, 2, 4, 6].map((i) => (
              <Pair key={i} a={right[i]} b={right[i + 1]} side="right" />
            ))}
          </div>
        </div>
      </div>

      {/* ---- Later rounds (fill in as the bracket advances) ---- */}
      <div>
        <h2 className="mb-4 font-display text-2xl font-bold">Road to the Final</h2>
        <div className="overflow-x-auto pb-4">
          <div className="flex min-w-max gap-6">
            {STAGES.map((s) => {
              const list = (matches ?? []).filter((m) => m.stage === s.key);
              return (
                <div key={s.key} className="w-64 shrink-0">
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    {s.label}
                  </h3>
                  <div className="space-y-3">
                    {list.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-6 text-center text-xs text-muted-foreground">
                        Awaiting qualifiers
                      </div>
                    )}
                    {list.map((m) => (
                      <div
                        key={m.id}
                        className="rounded-2xl border border-border bg-surface p-3 shadow-card"
                      >
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          {m.kickoff_utc ? formatNPTDate(m.kickoff_utc) : ""}
                        </p>
                        <CardSide match={m} team={m.team_a} score={m.score_a} />
                        <div className="my-1 h-px bg-border" />
                        <CardSide match={m} team={m.team_b} score={m.score_b} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A pair of R32 matches, bracketed toward the centre like the poster. */
function Pair({ a, b, side }: { a?: Match; b?: Match; side: "left" | "right" }) {
  const bracket =
    side === "left"
      ? "rounded-r-2xl border-y border-r border-amber-400/25 pr-4"
      : "rounded-l-2xl border-y border-l border-amber-400/25 pl-4";
  return (
    <div className={`relative space-y-4 py-2 ${bracket}`}>
      {a && <MatchRow m={a} side={side} />}
      {b && <MatchRow m={b} side={side} />}
      {/* stub toward the trophy */}
      <span
        className={`absolute top-1/2 hidden h-px w-4 bg-amber-400/25 lg:block ${
          side === "left" ? "right-0 translate-x-full" : "left-0 -translate-x-full"
        }`}
      />
    </div>
  );
}

/** Two circular flags + VS, mirrored for the right side (like the image). */
function MatchRow({ m, side }: { m: Match; side: "left" | "right" }) {
  return (
    <div
      className={`flex items-center justify-center gap-2 ${
        side === "right" ? "flex-row-reverse" : ""
      }`}
    >
      <FlagCircle
        team={m.team_a}
        won={m.winner_team_id != null && m.winner_team_id === m.team_a_id}
      />
      <span className="rounded-full bg-black/40 px-1.5 py-0.5 text-[9px] font-black text-amber-300">
        VS
      </span>
      <FlagCircle
        team={m.team_b}
        won={m.winner_team_id != null && m.winner_team_id === m.team_b_id}
      />
    </div>
  );
}

function FlagCircle({ team, won }: { team: Team | null; won: boolean }) {
  const src = flagImg(team);
  return (
    <div className="flex w-[68px] flex-col items-center gap-1">
      <div
        className={`flex size-12 items-center justify-center overflow-hidden rounded-full border-2 bg-white shadow md:size-14 ${
          won ? "border-amber-300 ring-2 ring-amber-300/60" : "border-white/30"
        }`}
      >
        {src ? (
          <img
            src={src}
            alt={team?.name ?? "TBD"}
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <span className="text-2xl">{team?.flag_emoji ?? "🏳️"}</span>
        )}
      </div>
      <span className="w-full truncate text-center text-[10px] font-bold text-white/90">
        {team?.name ?? "TBD"}
      </span>
    </div>
  );
}

/** One side of a later-round card (flag + name + score). */
function CardSide({
  match,
  team,
  score,
}: {
  match: Match;
  team: Team | null;
  score: number | null;
}) {
  const src = flagImg(team);
  const won = match.winner_team_id != null && team?.id != null && match.winner_team_id === team.id;
  return (
    <div
      className={`flex items-center justify-between rounded-lg p-2 text-sm ${won ? "bg-primary/10 font-bold" : ""}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="size-5 overflow-hidden rounded-full border border-border bg-white">
          {src ? (
            <img src={src} alt="" loading="lazy" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-xs">
              {team?.flag_emoji ?? "🏳️"}
            </span>
          )}
        </span>
        <span className="truncate">{team?.name ?? "TBD"}</span>
      </span>
      <span className="font-mono text-muted-foreground">{score ?? "—"}</span>
    </div>
  );
}
