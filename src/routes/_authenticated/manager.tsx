import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Crest } from "@/components/Crest";
import { toast } from "sonner";
import { Shirt, Search, Plus, X, Wallet, Star, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/manager")({
  head: () => ({ meta: [{ title: "Manager · Focus Premier League Pool" }] }),
  component: ManagerPage,
});

const START = 100.0; // £m starting budget
const SQUAD_MAX = 15;
const POS_LIMIT: Record<string, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const POS_ORDER = ["GK", "DEF", "MID", "FWD"] as const;
const MAX_PER_CLUB = 3;

const FORMATIONS: Record<string, { DEF: number; MID: number; FWD: number }> = {
  "4-4-2": { DEF: 4, MID: 4, FWD: 2 },
  "4-3-3": { DEF: 4, MID: 3, FWD: 3 },
  "4-2-3-1": { DEF: 4, MID: 5, FWD: 1 },
  "3-5-2": { DEF: 3, MID: 5, FWD: 2 },
  "3-4-3": { DEF: 3, MID: 4, FWD: 3 },
  "5-3-2": { DEF: 5, MID: 3, FWD: 2 },
};

type Player = {
  id: string;
  name: string;
  full_name: string | null;
  club: string;
  club_short: string | null;
  position: string;
  price: number;
  points: number;
  crest: string | null;
};
type Squad = { id: string; player_id: string; price_paid: number; player: Player | null };

const money = (n: number) => `£${n.toFixed(1)}m`;
/** A Football-Manager-style overall rating (58–99), from price + form points. */
const ovr = (p: Player) =>
  Math.max(58, Math.min(99, Math.round(58 + (p.price - 4) * 2.8 + p.points / 40)));
const ratingColor = (r: number) =>
  r >= 85
    ? "bg-pitch text-white"
    : r >= 75
      ? "bg-primary text-primary-foreground"
      : r >= 68
        ? "bg-amber-pop/90 text-black"
        : "bg-secondary text-foreground";

function ManagerPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"squad" | "transfers">("squad");
  const [formation, setFormation] = useState("4-3-3");
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<string>("ALL");
  const [sort, setSort] = useState<"rating" | "price" | "cheap" | "points">("rating");

  const playersQ = useQuery({
    queryKey: ["players"],
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("players").select("*");
      if (error) throw error;
      return (data ?? []) as Player[];
    },
  });
  const notSetUp =
    playersQ.isError &&
    /players|squad_players|schema cache|does not exist|relation/i.test(
      String((playersQ.error as any)?.message ?? ""),
    );

  const squadQ = useQuery({
    queryKey: ["my-squad", user.id],
    enabled: !notSetUp,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("squad_players")
        .select("id, player_id, price_paid, player:players(*)")
        .eq("user_id", user.id);
      if (error) throw error;
      return (data ?? []) as Squad[];
    },
  });

  const squad = (squadQ.data ?? []).filter((s) => s.player);
  const ownedIds = new Set(squad.map((s) => s.player_id));
  const spent = squad.reduce((s, x) => s + Number(x.price_paid), 0);
  const budget = START - spent;
  const value = squad.reduce((s, x) => s + (x.player?.price ?? 0), 0);
  const posCount = (p: string) => squad.filter((s) => s.player?.position === p).length;
  const clubCount = (c: string | null) => squad.filter((s) => s.player?.club_short === c).length;

  // Build a starting XI from the squad in the chosen formation (best-rated first).
  const shape = FORMATIONS[formation];
  const byPos = (p: string) =>
    squad.filter((s) => s.player?.position === p).sort((a, b) => ovr(b.player!) - ovr(a.player!));
  const lineFor = (p: "DEF" | "MID" | "FWD") => byPos(p).slice(0, shape[p]);
  const gk = byPos("GK").slice(0, 1);
  const lines = { GK: gk, DEF: lineFor("DEF"), MID: lineFor("MID"), FWD: lineFor("FWD") };
  const starterIds = new Set([...gk, ...lines.DEF, ...lines.MID, ...lines.FWD].map((s) => s.id));
  const bench = squad.filter((s) => !starterIds.has(s.id));
  const starters = squad.filter((s) => starterIds.has(s.id));
  const xiRating = starters.length
    ? Math.round(starters.reduce((s, x) => s + ovr(x.player!), 0) / starters.length)
    : 0;

  function reason(p: Player): string | null {
    if (ownedIds.has(p.id)) return "In squad";
    if (squad.length >= SQUAD_MAX) return "Squad full";
    if (posCount(p.position) >= POS_LIMIT[p.position]) return `${p.position} full`;
    if (clubCount(p.club_short) >= MAX_PER_CLUB) return "3 max / club";
    if (p.price > budget + 1e-9) return "Over budget";
    return null;
  }

  async function buy(p: Player) {
    const why = reason(p);
    if (why) return toast.error(why);
    setBusy(p.id);
    const { error } = await (supabase as any)
      .from("squad_players")
      .insert({ user_id: user.id, player_id: p.id, price_paid: p.price });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`Signed ${p.name} · ${money(p.price)}`);
    qc.invalidateQueries({ queryKey: ["my-squad", user.id] });
  }

  async function sell(s: Squad) {
    setBusy(s.id);
    const { error } = await (supabase as any).from("squad_players").delete().eq("id", s.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.message(`Sold ${s.player?.name} · +${money(Number(s.price_paid))}`);
    qc.invalidateQueries({ queryKey: ["my-squad", user.id] });
  }

  const goBuy = (position: string) => {
    setPos(position);
    setTab("transfers");
  };

  // Transfer market
  const term = q.trim().toLowerCase();
  const market = (playersQ.data ?? [])
    .filter((p) => (pos === "ALL" ? true : p.position === pos))
    .filter(
      (p) =>
        !term ||
        p.name.toLowerCase().includes(term) ||
        (p.full_name ?? "").toLowerCase().includes(term) ||
        (p.club ?? "").toLowerCase().includes(term),
    )
    .sort((a, b) =>
      sort === "rating"
        ? ovr(b) - ovr(a)
        : sort === "points"
          ? b.points - a.points
          : sort === "price"
            ? b.price - a.price
            : a.price - b.price,
    );
  const shown = market.slice(0, 60);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="flex items-center gap-2 font-display text-4xl font-bold">
          <Shirt className="size-8 text-primary" /> Manager
        </h1>
        <p className="mt-1 text-muted-foreground">
          Take charge — sign your squad, pick a formation, build a team to be proud of.
        </p>
      </header>

      {notSetUp && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/5 p-4 text-sm">
          <p className="font-bold text-foreground">⚙️ One-time setup needed</p>
          <p className="mt-1 text-muted-foreground">
            The Manager game needs its database tables and player catalogue. Once they&apos;re
            added, this goes live automatically.
          </p>
        </div>
      )}

      {/* Club identity / budget bar */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        <Stat icon={<Wallet className="size-4" />} label="Budget" value={money(budget)} accent />
        <Stat
          icon={<Users className="size-4" />}
          label="Squad"
          value={`${squad.length}/${SQUAD_MAX}`}
        />
        <Stat label="Team value" value={money(value)} />
        <Stat
          icon={<Star className="size-4" />}
          label="XI rating"
          value={xiRating ? String(xiRating) : "—"}
        />
        <Stat
          label="XI points"
          value={String(starters.reduce((s, x) => s + (x.player?.points ?? 0), 0))}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl border border-border bg-surface p-1">
        {(["squad", "transfers"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-bold capitalize transition ${
              tab === t
                ? "bg-primary text-primary-foreground shadow-glow"
                : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            {t === "squad" ? "My Squad" : "Transfer Market"}
          </button>
        ))}
      </div>

      {tab === "squad" ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          {/* Formation pitch */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Formation
              </span>
              {Object.keys(FORMATIONS).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormation(f)}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                    formation === f
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-surface hover:border-primary"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <Pitch lines={lines} shape={shape} onSell={sell} onEmpty={goBuy} busy={busy} />
          </div>

          {/* Bench + info */}
          <div className="space-y-3">
            <h3 className="font-display text-lg font-bold">
              Bench <span className="text-sm text-muted-foreground">({bench.length})</span>
            </h3>
            {bench.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border bg-surface p-4 text-center text-xs text-muted-foreground">
                No subs yet. Sign 15 players to fill your XI and bench.
              </p>
            ) : (
              <div className="space-y-1.5">
                {bench.map((s) => (
                  <BenchRow key={s.id} s={s} onSell={() => sell(s)} busy={busy === s.id} />
                ))}
              </div>
            )}
            <button
              onClick={() => setTab("transfers")}
              className="w-full rounded-xl bg-pitch py-2.5 text-sm font-bold text-white transition hover:opacity-90"
            >
              + Sign players
            </button>
          </div>
        </div>
      ) : (
        /* Transfer market */
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search player or club…"
                className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as any)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="rating">Best rated</option>
              <option value="points">Top points</option>
              <option value="price">Most expensive</option>
              <option value="cheap">Cheapest</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["ALL", ...POS_ORDER].map((p) => (
              <button
                key={p}
                onClick={() => setPos(p)}
                className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                  pos === p
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-surface hover:border-primary"
                }`}
              >
                {p === "ALL" ? "All" : p}
              </button>
            ))}
          </div>

          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((p) => {
              const why = reason(p);
              const r = ovr(p);
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2.5 rounded-xl border border-border bg-surface p-2"
                >
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-lg font-display text-sm font-bold ${ratingColor(r)}`}
                  >
                    {r}
                  </span>
                  <Crest src={p.crest} size={26} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{p.name}</p>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {p.club_short} · {p.position} · {p.points} pts
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold">{money(p.price)}</span>
                  <button
                    onClick={() => buy(p)}
                    disabled={!!why || busy === p.id}
                    title={why ?? "Sign player"}
                    className={`shrink-0 rounded-lg p-2 transition ${
                      why
                        ? "cursor-not-allowed text-muted-foreground opacity-40"
                        : "bg-pitch text-white hover:opacity-90"
                    }`}
                  >
                    {ownedIds.has(p.id) ? (
                      <span className="px-0.5 text-[11px] font-bold">✓</span>
                    ) : (
                      <Plus className="size-4" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
          {!notSetUp && (
            <p className="text-[11px] text-muted-foreground">
              Showing {shown.length} of {market.length} — search or filter to narrow.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** The formation pitch: rows of player tokens (FWD at top → GK at bottom). */
function Pitch({
  lines,
  shape,
  onSell,
  onEmpty,
  busy,
}: {
  lines: Record<string, Squad[]>;
  shape: { DEF: number; MID: number; FWD: number };
  onSell: (s: Squad) => void;
  onEmpty: (pos: string) => void;
  busy: string | null;
}) {
  const rows: Array<["GK" | "DEF" | "MID" | "FWD", number]> = [
    ["FWD", shape.FWD],
    ["MID", shape.MID],
    ["DEF", shape.DEF],
    ["GK", 1],
  ];
  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-white/10 p-3 shadow-card"
      style={{
        background:
          "repeating-linear-gradient(0deg,#166534 0px,#166534 44px,#15803d 44px,#15803d 88px)",
      }}
    >
      {/* pitch markings */}
      <div className="pointer-events-none absolute inset-3 rounded-2xl border-2 border-white/20" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 size-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/20" />
      <div className="pointer-events-none absolute left-3 right-3 top-1/2 h-0.5 -translate-y-1/2 bg-white/20" />

      <div className="relative flex flex-col justify-between gap-3 py-2">
        {rows.map(([pos, count]) => {
          const players = lines[pos] ?? [];
          const slots = Array.from({ length: count }, (_, i) => players[i] ?? null);
          return (
            <div key={pos} className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              {slots.map((s, i) =>
                s ? (
                  <PitchToken key={s.id} s={s} onSell={() => onSell(s)} busy={busy === s.id} />
                ) : (
                  <button
                    key={`${pos}-${i}`}
                    onClick={() => onEmpty(pos)}
                    className="flex w-16 flex-col items-center gap-1 rounded-xl border-2 border-dashed border-white/30 bg-black/10 px-1 py-2 text-white/70 transition hover:border-white/60 hover:bg-black/20 sm:w-[70px]"
                  >
                    <Plus className="size-5" />
                    <span className="text-[9px] font-bold uppercase">{pos}</span>
                  </button>
                ),
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PitchToken({ s, onSell, busy }: { s: Squad; onSell: () => void; busy: boolean }) {
  const p = s.player!;
  const r = ovr(p);
  return (
    <div className="group relative w-16 sm:w-[70px]">
      <div className="flex flex-col items-center gap-0.5 rounded-xl bg-white/95 px-1 py-1.5 text-center shadow-md">
        <div className="relative">
          <Crest src={p.crest} size={30} />
          <span
            className={`absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full text-[9px] font-bold ${ratingColor(r)}`}
          >
            {r}
          </span>
        </div>
        <span className="w-full truncate text-[10px] font-bold leading-tight text-slate-900">
          {p.name}
        </span>
        <span className="text-[9px] font-semibold text-slate-500">{money(p.price)}</span>
      </div>
      <button
        onClick={onSell}
        disabled={busy}
        title="Sell"
        className="absolute -right-1.5 -top-1.5 hidden size-5 place-items-center rounded-full bg-magenta text-white shadow group-hover:grid disabled:opacity-50"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

function BenchRow({ s, onSell, busy }: { s: Squad; onSell: () => void; busy: boolean }) {
  const p = s.player!;
  const r = ovr(p);
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-2.5 py-1.5 text-sm">
      <span
        className={`grid size-7 shrink-0 place-items-center rounded-md text-xs font-bold ${ratingColor(r)}`}
      >
        {r}
      </span>
      <Crest src={p.crest} size={20} />
      <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
      <span className="shrink-0 text-[10px] uppercase text-muted-foreground">{p.position}</span>
      <button
        onClick={onSell}
        disabled={busy}
        title="Sell"
        className="shrink-0 rounded-md p-1 text-magenta transition hover:bg-magenta/10 disabled:opacity-50"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  accent = false,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-3 shadow-card ${
        accent ? "border-primary/40 bg-primary/5" : "border-border bg-surface"
      }`}
    >
      <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className={`mt-0.5 font-display text-xl font-bold ${accent ? "text-primary" : ""}`}>
        {value}
      </p>
    </div>
  );
}
