import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Crest } from "@/components/Crest";
import { toast } from "sonner";
import { Shirt, Search, Plus, X, Wallet, Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/manager")({
  head: () => ({ meta: [{ title: "Manager · Focus Premier League Pool" }] }),
  component: ManagerPage,
});

const START = 100.0; // £m starting budget
const SQUAD_MAX = 15;
const POS_LIMIT: Record<string, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const POS_ORDER = ["GK", "DEF", "MID", "FWD"] as const;
const POS_LABEL: Record<string, string> = {
  GK: "Goalkeepers",
  DEF: "Defenders",
  MID: "Midfielders",
  FWD: "Forwards",
};
const MAX_PER_CLUB = 3;

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

function ManagerPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<string>("ALL");
  const [sort, setSort] = useState<"points" | "price" | "cheap">("points");

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
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("squad_players")
        .select("id, player_id, price_paid, player:players(*)")
        .eq("user_id", user.id);
      if (error) throw error;
      return (data ?? []) as Squad[];
    },
    enabled: !notSetUp,
  });

  const squad = squadQ.data ?? [];
  const ownedIds = new Set(squad.map((s) => s.player_id));
  const spent = squad.reduce((s, x) => s + Number(x.price_paid), 0);
  const budget = START - spent;
  const value = squad.reduce((s, x) => s + (x.player?.price ?? 0), 0);
  const points = squad.reduce((s, x) => s + (x.player?.points ?? 0), 0);
  const posCount = (p: string) => squad.filter((s) => s.player?.position === p).length;
  const clubCount = (c: string | null) => squad.filter((s) => s.player?.club_short === c).length;

  function reason(p: Player): string | null {
    if (ownedIds.has(p.id)) return "In squad";
    if (squad.length >= SQUAD_MAX) return "Squad full";
    if (posCount(p.position) >= POS_LIMIT[p.position]) return `${p.position} full`;
    if (clubCount(p.club_short) >= MAX_PER_CLUB) return "3 max / club";
    if (p.price > budget + 1e-9) return "Too pricey";
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
    toast.success(`Signed ${p.name} for ${money(p.price)}`);
    qc.invalidateQueries({ queryKey: ["my-squad", user.id] });
  }

  async function sell(s: Squad) {
    setBusy(s.id);
    const { error } = await (supabase as any).from("squad_players").delete().eq("id", s.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.message(`Sold ${s.player?.name} for ${money(Number(s.price_paid))}`);
    qc.invalidateQueries({ queryKey: ["my-squad", user.id] });
  }

  // Market: filter + sort, cap displayed for performance.
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
      sort === "points"
        ? b.points - a.points
        : sort === "price"
          ? b.price - a.price
          : a.price - b.price,
    );
  const shown = market.slice(0, 60);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-4xl font-bold">
            <Shirt className="size-8 text-primary" /> Manager
          </h1>
          <p className="mt-1 text-muted-foreground">
            Build your dream XV from scratch — {money(START)} budget, 15 players, max 3 per club.
            Buy low, sell high.
          </p>
        </div>
      </header>

      {notSetUp && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/5 p-4 text-sm">
          <p className="font-bold text-foreground">⚙️ One-time setup needed</p>
          <p className="mt-1 text-muted-foreground">
            The Manager game needs a couple of database tables that aren&apos;t created yet. Once
            they&apos;re added (and players loaded), this goes live automatically.
          </p>
        </div>
      )}

      {/* Budget bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          icon={<Wallet className="size-4" />}
          label="Budget left"
          value={money(budget)}
          accent
        />
        <Stat label="Squad" value={`${squad.length}/${SQUAD_MAX}`} />
        <Stat label="Team value" value={money(value)} />
        <Stat icon={<Trophy className="size-4" />} label="Total points" value={String(points)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Your squad */}
        <section className="space-y-3">
          <h2 className="font-display text-xl font-bold">Your squad</h2>
          {squad.length === 0 && !notSetUp && (
            <p className="rounded-2xl border border-dashed border-border bg-surface p-6 text-center text-sm text-muted-foreground">
              No players yet — sign some from the transfer market. →
            </p>
          )}
          {POS_ORDER.map((p) => {
            const list = squad.filter((s) => s.player?.position === p);
            const need = POS_LIMIT[p];
            return (
              <div key={p}>
                <div className="mb-1 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  <span>{POS_LABEL[p]}</span>
                  <span className={list.length === need ? "text-pitch" : ""}>
                    {list.length}/{need}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {list.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-2 rounded-xl border border-border bg-surface px-2.5 py-1.5 text-sm"
                    >
                      <Crest src={s.player?.crest} size={20} />
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {s.player?.name}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {money(Number(s.price_paid))}
                      </span>
                      <button
                        onClick={() => sell(s)}
                        disabled={busy === s.id}
                        title="Sell"
                        className="shrink-0 rounded-md p-1 text-magenta transition hover:bg-magenta/10 disabled:opacity-50"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ))}
                  {list.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground">
                      Empty
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        {/* Transfer market */}
        <section className="space-y-3">
          <h2 className="font-display text-xl font-bold">Transfer market</h2>
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

          <div className="grid gap-1.5 sm:grid-cols-2">
            {shown.map((p) => {
              const why = reason(p);
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-xl border border-border bg-surface px-2.5 py-1.5"
                >
                  <Crest src={p.crest} size={24} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.name}</p>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {p.club_short} · {p.position} · {p.points} pts
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold">{money(p.price)}</span>
                  <button
                    onClick={() => buy(p)}
                    disabled={!!why || busy === p.id}
                    title={why ?? "Sign"}
                    className={`shrink-0 rounded-md p-1.5 transition ${
                      why
                        ? "cursor-not-allowed text-muted-foreground opacity-50"
                        : "bg-pitch text-white hover:opacity-90"
                    }`}
                  >
                    {ownedIds.has(p.id) ? (
                      <span className="px-1 text-[10px]">✓</span>
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
              Showing {shown.length} of {market.length} players — search or filter to narrow.
            </p>
          )}
        </section>
      </div>
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
