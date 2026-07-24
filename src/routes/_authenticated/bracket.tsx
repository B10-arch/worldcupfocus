import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatNPT, formatNPTDate } from "@/lib/time";

export const Route = createFileRoute("/_authenticated/bracket")({
  // A league has no knockout bracket — send anyone here to the dashboard.
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  head: () => ({ meta: [{ title: "Focus Premier League Pool" }] }),
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

// Real flag image (cropped into a circle) — most teams' ISO-2 is encoded in
// their flag emoji; subdivision flags (England etc.) need an explicit code.
const ISO_OVERRIDE: Record<string, string> = { ENG: "gb-eng", SCO: "gb-sct", WAL: "gb-wls" };
function flagImg(team: Team | null): string | null {
  if (!team) return null;
  const o = team.code ? ISO_OVERRIDE[team.code] : undefined;
  if (o) return `https://flagcdn.com/w80/${o}.png`;
  const cps = Array.from(team.flag_emoji ?? "");
  if (cps.length === 2) {
    const a = cps[0].codePointAt(0)!;
    const b = cps[1].codePointAt(0)!;
    if (a >= 0x1f1e6 && a <= 0x1f1ff && b >= 0x1f1e6 && b <= 0x1f1ff) {
      const iso = (
        String.fromCharCode(65 + a - 0x1f1e6) + String.fromCharCode(65 + b - 0x1f1e6)
      ).toLowerCase();
      return `https://flagcdn.com/w80/${iso}.png`;
    }
  }
  return null;
}

// ---- Geometry (computed so the connector lines always line up) ----
// Tall + narrow on purpose: the bracket scales to fit the screen width, so a
// taller/narrower shape fills more of the screen (bigger, more readable).
const BOX_W = 122;
const BOX_H = 60;
const V_GAP = 50;
const COL_GAP = 16;
const COLW = BOX_W + COL_GAP;
const ROW = BOX_H + V_GAP;
const HEAD = 34; // header band
const HEIGHT = 8 * ROW; // 8 R32 matches per side
const WIDTH = 9 * COLW - COL_GAP;

const COL_INDEX: Record<string, Record<string, number>> = {
  left: { r32: 0, r16: 1, qf: 2, sf: 3 },
  right: { r32: 8, r16: 7, qf: 6, sf: 5 },
};
const colX = (side: string, round: string) =>
  side === "center" ? 4 * COLW : COL_INDEX[side]![round]! * COLW;

const keyIds = (a: string, b: string) => [a, b].sort().join("-");

// Official FIFA knockout order — left half top→bottom, then right half. Adjacent
// pairs feed the Round of 16, so winners advance to the correct next-round match.
const R32_ORDER: [string, string][] = [
  ["GER", "PAR"],
  ["FRA", "SWE"],
  ["RSA", "CAN"],
  ["NED", "MAR"],
  ["POR", "CRO"],
  ["ESP", "AUT"],
  ["USA", "BIH"],
  ["BEL", "SEN"],
  ["BRA", "JPN"],
  ["CIV", "NOR"],
  ["MEX", "ECU"],
  ["ENG", "COD"],
  ["ARG", "CPV"],
  ["AUS", "EGY"],
  ["SUI", "ALG"],
  ["COL", "GHA"],
];

type Node = {
  round: string;
  side: string;
  x: number;
  cy: number;
  teams: [Team | null, Team | null];
  match?: Match;
  winner: Team | null;
  loser: Team | null;
  children?: Node[];
};

function BracketPage() {
  const { data: matches } = useQuery({
    queryKey: ["bracket"],
    refetchInterval: 60_000, // live: winners advance as results come in
    queryFn: async () => {
      const { data } = await supabase
        .from("matches")
        .select("*, team_a:teams!matches_team_a_id_fkey(*), team_b:teams!matches_team_b_id_fkey(*)")
        .neq("stage", "group")
        .order("kickoff_utc");
      return (data ?? []) as Match[];
    },
  });

  // Auto-scale the whole bracket to fit the container width — no horizontal
  // scroll; the entire tree is always visible at once.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / WIDTH));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ms = matches ?? [];
  // Order R32 by the official FIFA bracket structure (matched by team codes), so
  // winners advance to the correct Round-of-16 matchups.
  const r32raw = ms.filter((m) => m.stage === "r32");
  const byCodes = new Map<string, Match>();
  for (const m of r32raw)
    if (m.team_a?.code && m.team_b?.code)
      byCodes.set([m.team_a.code, m.team_b.code].sort().join("-"), m);
  const ordered = R32_ORDER.map(([a, b]) => byCodes.get([a, b].sort().join("-"))).filter(
    Boolean,
  ) as Match[];
  const r32 = ordered.length === 16 ? ordered : r32raw;

  // Look up a played match by the two teams in it (order-independent), so a
  // winner propagates regardless of which round-row it was stored on.
  const pairMap = new Map<string, Match>();
  for (const m of ms)
    if (m.team_a_id && m.team_b_id) pairMap.set(keyIds(m.team_a_id, m.team_b_id), m);
  // Fallback rows per stage (kickoff order) for the kickoff time on empty boxes.
  const pos: Record<string, Match[]> = {};
  for (const st of ["r16", "qf", "sf", "final", "third"])
    pos[st] = ms.filter((m) => m.stage === st);

  function winnerOf(m: Match | undefined, a: Team | null, b: Team | null): Team | null {
    if (!m) return null;
    if (m.winner_team_id) return [a, b].find((t) => t && t.id === m.winner_team_id) ?? null;
    if (m.score_a != null && m.score_b != null && m.score_a !== m.score_b) {
      const id = m.score_a > m.score_b ? m.team_a_id : m.team_b_id;
      return [a, b].find((t) => t && t.id === id) ?? null;
    }
    return null;
  }

  function resolve(n: Omit<Node, "winner" | "loser" | "match"> & { posIdx?: number }): Node {
    const [a, b] = n.teams;
    const match =
      n.round === "r32"
        ? (n as any).match
        : ((a && b ? pairMap.get(keyIds(a.id, b.id)) : undefined) ??
          (n.posIdx != null ? pos[n.round]?.[n.posIdx] : undefined));
    const finished = !!match && (match.status === "finished" || match.winner_team_id != null);
    const winner = finished ? winnerOf(match, a, b) : null;
    const loser = finished && winner ? (winner.id === a?.id ? b : a) : null;
    return { ...n, match, winner, loser } as Node;
  }

  function buildSide(rows: Match[], side: string, base: { r16: number; qf: number; sf: number }) {
    const r = rows.map((m, i) =>
      resolve({
        round: "r32",
        side,
        x: colX(side, "r32"),
        cy: i * ROW + BOX_H / 2,
        teams: [m.team_a, m.team_b],
        match: m,
      } as any),
    );
    const r16 = [0, 1, 2, 3].map((j) =>
      resolve({
        round: "r16",
        side,
        posIdx: base.r16 + j,
        x: colX(side, "r16"),
        cy: (r[2 * j].cy + r[2 * j + 1].cy) / 2,
        teams: [r[2 * j].winner, r[2 * j + 1].winner],
        children: [r[2 * j], r[2 * j + 1]],
      }),
    );
    const qf = [0, 1].map((k) =>
      resolve({
        round: "qf",
        side,
        posIdx: base.qf + k,
        x: colX(side, "qf"),
        cy: (r16[2 * k].cy + r16[2 * k + 1].cy) / 2,
        teams: [r16[2 * k].winner, r16[2 * k + 1].winner],
        children: [r16[2 * k], r16[2 * k + 1]],
      }),
    );
    const sf = resolve({
      round: "sf",
      side,
      posIdx: base.sf,
      x: colX(side, "sf"),
      cy: (qf[0].cy + qf[1].cy) / 2,
      teams: [qf[0].winner, qf[1].winner],
      children: [qf[0], qf[1]],
    });
    return { r32: r, r16, qf, sf };
  }

  const haveBracket = r32.length === 16;
  const L = haveBracket ? buildSide(r32.slice(0, 8), "left", { r16: 0, qf: 0, sf: 0 }) : null;
  const R = haveBracket ? buildSide(r32.slice(8, 16), "right", { r16: 4, qf: 2, sf: 1 }) : null;
  const final =
    L && R
      ? resolve({
          round: "final",
          side: "center",
          posIdx: 0,
          x: colX("center", "final"),
          cy: (L.sf.cy + R.sf.cy) / 2,
          teams: [L.sf.winner, R.sf.winner],
          children: [L.sf, R.sf],
        })
      : null;
  const third =
    L && R
      ? resolve({
          round: "third",
          side: "center",
          posIdx: 0,
          x: colX("center", "final"),
          cy: HEIGHT - BOX_H,
          teams: [L.sf.loser, R.sf.loser],
        })
      : null;

  const allNodes: Node[] =
    L && R ? [...L.r32, ...L.r16, ...L.qf, L.sf, ...R.r32, ...R.r16, ...R.qf, R.sf] : [];
  if (final) allNodes.push(final);
  if (third) allNodes.push(third);

  // Connector polylines from each parent to its two children.
  const edges: string[] = [];
  const addEdge = (parent: Node, child: Node) => {
    const pcy = child.cy;
    if (child.x < parent.x) {
      const cR = child.x + BOX_W;
      const pL = parent.x;
      const mid = (cR + pL) / 2;
      edges.push(`${cR},${pcy} ${mid},${pcy} ${mid},${parent.cy} ${pL},${parent.cy}`);
    } else {
      const cL = child.x;
      const pR = parent.x + BOX_W;
      const mid = (cL + pR) / 2;
      edges.push(`${cL},${pcy} ${mid},${pcy} ${mid},${parent.cy} ${pR},${parent.cy}`);
    }
  };
  for (const n of allNodes)
    if (n.children && n.round !== "third") n.children.forEach((c) => addEdge(n, c));

  const HEADERS = [
    "Round of 32",
    "Round of 16",
    "Quarter-Finals",
    "Semi-Finals",
    "Final",
    "Semi-Finals",
    "Quarter-Finals",
    "Round of 16",
    "Round of 32",
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-3xl font-bold md:text-4xl">Knockout Bracket</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Round of 32 → Final. Winners advance automatically as results come in. Fits your screen —
          pinch/zoom for detail.
        </p>
      </header>

      <div
        className="overflow-hidden rounded-3xl border border-emerald-400/20 p-3 shadow-card"
        style={{
          backgroundImage:
            "radial-gradient(120% 90% at 50% 0%, #0c2f2a 0%, #0a221f 55%, #07191a 100%)",
        }}
      >
        <div ref={wrapRef} className="w-full">
          <div style={{ height: (HEAD + HEIGHT + 8) * scale }}>
            <div
              className="relative"
              style={{
                width: WIDTH,
                height: HEAD + HEIGHT + 8,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            >
              {/* column headers */}
              {HEADERS.map((h, i) => (
                <div
                  key={i}
                  className="absolute -translate-x-1/2 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300"
                  style={{ left: i * COLW + BOX_W / 2, top: 0, width: BOX_W + COL_GAP }}
                >
                  {h}
                </div>
              ))}
              {/* center title (sits in the empty centre-top space) */}
              <div
                className="absolute -translate-x-1/2 text-center"
                style={{ left: 4 * COLW + BOX_W / 2, top: HEAD + 30 }}
              >
                <p className="font-display text-lg font-black leading-none text-white">WORLD CUP</p>
                <p className="font-display text-3xl font-black leading-none text-amber-300">2026</p>
              </div>
              {final && (
                <div
                  className="absolute -translate-x-1/2 text-center text-xs font-black uppercase tracking-[0.2em] text-amber-300"
                  style={{ left: 4 * COLW + BOX_W / 2, top: HEAD + final.cy - BOX_H / 2 - 22 }}
                >
                  Final
                </div>
              )}

              {/* connectors */}
              <svg
                className="absolute inset-0 overflow-visible"
                style={{ top: HEAD, width: WIDTH, height: HEIGHT }}
                fill="none"
              >
                {edges.map((pts, i) => (
                  <polyline
                    key={i}
                    points={pts}
                    stroke="#5eead4"
                    strokeOpacity="0.45"
                    strokeWidth="1.5"
                  />
                ))}
              </svg>

              {/* boxes */}
              <div className="absolute inset-x-0" style={{ top: HEAD }}>
                {allNodes.map((n, i) => (
                  <Box key={i} n={n} />
                ))}
                {/* 3rd place label */}
                {third && (
                  <div
                    className="absolute -translate-x-1/2 text-center text-[9px] font-bold uppercase tracking-wider text-emerald-300/80"
                    style={{ left: 4 * COLW + BOX_W / 2, top: third.cy - BOX_H / 2 - 16 }}
                  >
                    3rd Place
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Box({ n }: { n: Node }) {
  const m = n.match;
  const timeLabel = m?.kickoff_utc
    ? m.status === "finished"
      ? "FT"
      : `${formatNPTDate(m.kickoff_utc)} · ${formatNPT(m.kickoff_utc)}`
    : "";
  const scoreFor = (t: Team | null) =>
    m && t && (m.status === "finished" || m.status === "live")
      ? t.id === m.team_a_id
        ? m.score_a
        : t.id === m.team_b_id
          ? m.score_b
          : null
      : null;
  const isFinal = n.round === "final";
  return (
    <div
      className="absolute"
      style={{ left: n.x, top: n.cy - BOX_H / 2, width: BOX_W, height: BOX_H }}
    >
      {timeLabel && (
        <span className="absolute -top-4 left-0 right-0 truncate text-center text-[8px] font-semibold uppercase tracking-wide text-white/45">
          {timeLabel}
        </span>
      )}
      <div
        className={`flex h-full flex-col overflow-hidden rounded-md border ${
          isFinal ? "border-amber-300/70 bg-amber-300/5" : "border-white/15 bg-white/[0.03]"
        }`}
      >
        <Slot
          team={n.teams[0]}
          score={scoreFor(n.teams[0])}
          win={n.winner?.id === n.teams[0]?.id}
        />
        <div className="h-px bg-white/10" />
        <Slot
          team={n.teams[1]}
          score={scoreFor(n.teams[1])}
          win={n.winner?.id === n.teams[1]?.id}
        />
      </div>
    </div>
  );
}

function Slot({ team, score, win }: { team: Team | null; score: number | null; win: boolean }) {
  const src = flagImg(team);
  return (
    <div className={`flex flex-1 items-center gap-1.5 px-1.5 ${win ? "bg-amber-300/20" : ""}`}>
      <span className="size-4 shrink-0 overflow-hidden rounded-full bg-white/80">
        {src ? (
          <img src={src} alt="" loading="lazy" className="size-full object-cover" />
        ) : team?.flag_emoji ? (
          <span className="flex size-full items-center justify-center text-[10px]">
            {team.flag_emoji}
          </span>
        ) : null}
      </span>
      <span
        className={`min-w-0 flex-1 truncate text-[10px] ${
          win ? "font-bold text-white" : team ? "font-semibold text-white/90" : "text-white/35"
        }`}
      >
        {team?.name ?? "TBD"}
      </span>
      <span className="shrink-0 font-mono text-[10px] text-amber-200/80">{score ?? ""}</span>
    </div>
  );
}
