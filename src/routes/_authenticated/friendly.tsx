import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatNPTDate, formatNPT } from "@/lib/time";
import { toast } from "sonner";
import {
  Handshake,
  Lock,
  Trophy,
  X,
  Target,
  Pencil,
  Wallet,
  ArrowRight,
  Coins,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/friendly")({
  head: () => ({ meta: [{ title: "Side Bets · Focus World Cup Pool" }] }),
  component: FriendlyBetsPage,
});

type Team = { id: string; name: string | null; flag_emoji: string | null; code: string | null };
type Match = {
  id: string;
  kickoff_utc: string;
  status: string;
  stage: string;
  winner_team_id: string | null;
  team_a: Team | null;
  team_b: Team | null;
};

// Rounds shown as separate sections (most advanced first).
const STAGE_ORDER = ["final", "third", "sf", "qf", "r16", "r32"] as const;
const STAGE_LABEL: Record<string, string> = {
  final: "🏆 Final",
  third: "🥉 Third-Place Play-off",
  sf: "Semi-Finals",
  qf: "Quarter-Finals",
  r16: "Round of 16",
  r32: "Round of 32",
};
type Bet = {
  id: string;
  match_id: string;
  proposer_id: string;
  proposer_team_id: string | null;
  acceptor_id: string | null;
  target_id: string | null;
  stake: string;
  status: string;
  settle_requested_by: string | null;
  settled_at: string | null;
  team: Team | null;
};
type Member = { id: string; display_name: string | null };
type FormValues = { teamId: string; stake: string; targetId: string };

// One settleable bet (per game). Each locked bet on a finished match becomes an
// item: the loser (debtor) owes the winner (creditor) the stake.
type SettleItem = {
  betId: string;
  debtorId: string;
  creditorId: string;
  amount: number | null; // rupees, or null for a non-cash dare
  stake: string;
  label: string; // the game
  settledAt: string | null;
  requestedBy: string | null; // who marked it settled (awaiting the other's OK)
};
type Settlement = {
  items: SettleItem[];
  pendingCount: number; // locked bets whose game hasn't finished yet
};

/**
 * Pull a rupee amount out of a free-text stake. Matches "500", "Rs 500",
 * "500/-", "₹1,000", "500 rupees" — but leaves dares like "loser buys momo" or
 * "2 plates of momo" as null so they're settled as activities, not cash.
 */
function parseMoney(raw: string): number | null {
  const s = raw.toLowerCase().replace(/,/g, "").trim();
  const pats = [
    /(?:rs\.?|npr|nrs\.?|₹|rupees?)\s*(\d+(?:\.\d+)?)/,
    /(\d+(?:\.\d+)?)\s*(?:rs\.?|npr|nrs\.?|rupees?|\/-)/,
    /^(\d+(?:\.\d+)?)$/,
  ];
  for (const p of pats) {
    const m = s.match(p);
    if (m) return Number(m[1]);
  }
  return null;
}

const fmtMoney = (n: number) => "Rs " + n.toLocaleString("en-IN");

/**
 * Turn every locked bet on a finished game into a per-game settlement item.
 * Proposer backs proposer_team_id; the acceptor backs the other team; the match
 * winner decides who owes whom the stake. No cross-game netting — each bet is
 * settled on its own, and only by the two players involved.
 */
function computeSettlement(bets: Bet[], matchById: Map<string, Match>): Settlement {
  const items: SettleItem[] = [];
  let pendingCount = 0;

  for (const bet of bets) {
    if (bet.status !== "accepted" || !bet.acceptor_id) continue;
    const m = matchById.get(bet.match_id);
    if (!m) continue;
    if (m.status !== "finished" || !m.winner_team_id) {
      pendingCount++;
      continue;
    }
    const otherId =
      m.team_a && m.team_b
        ? bet.proposer_team_id === m.team_a.id
          ? m.team_b.id
          : m.team_a.id
        : null;
    let debtor: string;
    let creditor: string;
    if (m.winner_team_id === bet.proposer_team_id) {
      creditor = bet.proposer_id;
      debtor = bet.acceptor_id;
    } else if (otherId && m.winner_team_id === otherId) {
      creditor = bet.acceptor_id;
      debtor = bet.proposer_id;
    } else {
      continue; // winner isn't either bet team — skip defensively
    }
    items.push({
      betId: bet.id,
      debtorId: debtor,
      creditorId: creditor,
      amount: parseMoney(bet.stake),
      stake: bet.stake,
      label: `${m.team_a?.name ?? "?"} v ${m.team_b?.name ?? "?"}`,
      settledAt: bet.settled_at ?? null,
      requestedBy: bet.settle_requested_by ?? null,
    });
  }

  // Unsettled first, then settled.
  items.sort((a, b) => Number(!!a.settledAt) - Number(!!b.settledAt));
  return { items, pendingCount };
}

function FriendlyBetsPage() {
  const { user } = Route.useRouteContext();

  const matchesQ = useQuery({
    queryKey: ["friendly-matches"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("matches")
        .select(
          "id, kickoff_utc, status, stage, winner_team_id, team_a:teams!matches_team_a_id_fkey(id,name,flag_emoji,code), team_b:teams!matches_team_b_id_fkey(id,name,flag_emoji,code)",
        )
        .in("stage", ["r32", "r16", "qf", "sf"])
        .not("team_a_id", "is", null)
        .not("team_b_id", "is", null)
        .order("kickoff_utc");
      return (data ?? []) as Match[];
    },
  });

  const betsQ = useQuery({
    queryKey: ["friendly-bets"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("friendly_bets")
        .select("*, team:teams!friendly_bets_proposer_team_id_fkey(id,name,flag_emoji,code)")
        .order("created_at", { ascending: false }); // newest offers on top
      if (error) throw error;
      return (data ?? []) as Bet[];
    },
  });

  // Names come from leaderboard_entries (readable by every member, unlike the
  // locked-down profiles table) so everyone — not just admins — sees who's who.
  const membersQ = useQuery({
    queryKey: ["pool-members"],
    queryFn: async () => {
      const { data } = await supabase
        .from("leaderboard_entries")
        .select("user_id, display_name")
        .order("display_name");
      return ((data ?? []) as { user_id: string; display_name: string | null }[]).map((r) => ({
        id: r.user_id,
        display_name: r.display_name,
      })) as Member[];
    },
  });
  const nameById = new Map<string, string>(
    (membersQ.data ?? []).map((m) => [m.id, m.display_name ?? "A member"]),
  );

  // "Settle up" — per-game settlement between the two players in each bet.
  const [showSettle, setShowSettle] = useState(false);
  const matchById = new Map<string, Match>((matchesQ.data ?? []).map((m) => [m.id, m]));
  const settlement = computeSettlement(betsQ.data ?? [], matchById);
  const myUnsettled = settlement.items.filter(
    (i) => !i.settledAt && (i.debtorId === user.id || i.creditorId === user.id),
  ).length;

  // Open offers you've passed on are hidden from your own list (kept locally —
  // the offer stays live for everyone else, since it's open to the whole pool).
  const [hidden, setHidden] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set<string>(JSON.parse(localStorage.getItem("fb-hidden") ?? "[]"));
    } catch {
      return new Set();
    }
  });
  const hideBet = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev).add(id);
      try {
        localStorage.setItem("fb-hidden", JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });

  const betsByMatch = new Map<string, Bet[]>();
  for (const b of betsQ.data ?? []) {
    const arr = betsByMatch.get(b.match_id) ?? [];
    arr.push(b);
    betsByMatch.set(b.match_id, arr);
  }

  const errMsg = betsQ.error
    ? String((betsQ.error as any).message ?? JSON.stringify(betsQ.error))
    : "";
  const notSetUp =
    betsQ.isError && /friendly_bets|schema cache|does not exist|relation/i.test(errMsg);

  // Upcoming games first (soonest first), then finished (most recent first) — so
  // R16 fixtures sit on top as the Round of 32 wraps up.
  const now = Date.now();
  const sortedMatches = [...(matchesQ.data ?? [])].sort((a, b) => {
    const ka = Date.parse(a.kickoff_utc);
    const kb = Date.parse(b.kickoff_utc);
    const ua = ka > now;
    const ub = kb > now;
    if (ua !== ub) return ua ? -1 : 1;
    return ua ? ka - kb : kb - ka;
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 font-display text-4xl font-bold">
            <Handshake className="size-8 text-primary" /> Side Bets
          </h1>
          <p className="mt-2 text-muted-foreground">
            Offer a bet on any knockout game (Round of 32 through the Semi-Finals) — pick a team and
            name your stake (money or a dare). Leave it open for anyone, or{" "}
            <span className="font-semibold text-foreground">challenge a specific member</span> (they
            can accept or reject). Edit or cancel your own offers anytime before kickoff.
          </p>
        </div>
        <button
          onClick={() => setShowSettle(true)}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-card transition hover:opacity-90"
        >
          <Wallet className="size-4" /> Settle Up
          {myUnsettled > 0 && (
            <span className="rounded-full bg-black/20 px-1.5 text-xs">{myUnsettled}</span>
          )}
        </button>
      </header>

      {notSetUp && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/5 p-4 text-sm">
          <p className="font-bold text-foreground">⚙️ One-time setup needed</p>
          <p className="mt-1 text-muted-foreground">
            Side bets need a small database table that isn&apos;t created yet. Once it&apos;s set
            up, this page goes live automatically.
          </p>
        </div>
      )}

      <div className="space-y-8">
        {STAGE_ORDER.filter((stage) => sortedMatches.some((m) => m.stage === stage)).map(
          (stage) => {
            const games = sortedMatches.filter((m) => m.stage === stage);
            return (
              <section key={stage} className="space-y-3">
                <div className="flex items-center gap-3">
                  <h2 className="shrink-0 font-display text-xl font-bold">{STAGE_LABEL[stage]}</h2>
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-muted-foreground">
                    {games.length} {games.length === 1 ? "game" : "games"}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {games.map((m) => (
                    <GameCard
                      key={m.id}
                      match={m}
                      bets={betsByMatch.get(m.id) ?? []}
                      userId={user.id}
                      members={(membersQ.data ?? []).filter((mem) => mem.id !== user.id)}
                      nameById={nameById}
                      hidden={hidden}
                      onHide={hideBet}
                      disabled={notSetUp}
                    />
                  ))}
                </div>
              </section>
            );
          },
        )}
      </div>

      {showSettle && (
        <SettleModal
          settlement={settlement}
          nameById={nameById}
          userId={user.id}
          onClose={() => setShowSettle(false)}
        />
      )}
    </div>
  );
}

/** Popup listing each bet's settlement, per game. Only the two players in a bet
 *  can settle it, and it takes both — one marks it, the other confirms. */
function SettleModal({
  settlement,
  nameById,
  userId,
  onClose,
}: {
  settlement: Settlement;
  nameById: Map<string, string>;
  userId: string;
  onClose: () => void;
}) {
  const { items, pendingCount } = settlement;
  const name = (id: string) => nameById.get(id) ?? "A member";

  const open = items.filter((i) => !i.settledAt);
  const settled = items.filter((i) => i.settledAt);

  // Your remaining balance from unsettled cash bets you're part of.
  const mineOpen = open.filter((i) => i.debtorId === userId || i.creditorId === userId);
  const net = mineOpen.reduce(
    (s, i) => (i.amount == null ? s : s + (i.creditorId === userId ? i.amount : -i.amount)),
    0,
  );
  const nothing = items.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-2xl border border-border bg-surface p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 font-display text-2xl font-bold">
              <Wallet className="size-6 text-primary" /> Settle Up
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {open.length} to settle · {settled.length} done
              {pendingCount > 0 && ` · ${pendingCount} awaiting results`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        {nothing ? (
          <div className="mt-6 rounded-xl border border-dashed border-border bg-background p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No bets have settled yet. Once locked bets&apos; games finish, they show up here to
              settle.
            </p>
            {pendingCount > 0 && (
              <p className="mt-2 text-xs font-semibold text-foreground">
                {pendingCount} locked {pendingCount === 1 ? "bet is" : "bets are"} waiting on
                results.
              </p>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            {mineOpen.length > 0 && (
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  Your remaining balance
                </p>
                <p
                  className={`mt-0.5 text-lg font-bold ${
                    net > 0 ? "text-pitch" : net < 0 ? "text-magenta" : "text-foreground"
                  }`}
                >
                  {net > 0
                    ? `You still collect ${fmtMoney(net)}`
                    : net < 0
                      ? `You still owe ${fmtMoney(-net)}`
                      : "Cash all square 👍"}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Across {mineOpen.length} unsettled {mineOpen.length === 1 ? "bet" : "bets"} of
                  yours (dares aren&apos;t counted as cash).
                </p>
              </div>
            )}

            {open.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  <Coins className="size-3.5" /> To settle ({open.length})
                </p>
                <div className="space-y-1.5">
                  {open.map((i) => (
                    <SettleItemRow key={i.betId} item={i} userId={userId} nameById={nameById} />
                  ))}
                </div>
              </div>
            )}

            {settled.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-pitch">
                  ✅ Settled ({settled.length})
                </p>
                <div className="space-y-1.5">
                  {settled.map((i) => (
                    <SettleItemRow key={i.betId} item={i} userId={userId} nameById={nameById} />
                  ))}
                </div>
              </div>
            )}

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Each game is settled on its own. Only the two players in a bet can settle it — one
              taps <span className="font-semibold text-foreground">Mark as settled</span>, then the
              other <span className="font-semibold text-foreground">confirms</span>. Everyone can
              see the status.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** One bet's settlement line + the two-party settle/confirm controls. */
function SettleItemRow({
  item,
  userId,
  nameById,
}: {
  item: SettleItem;
  userId: string;
  nameById: Map<string, string>;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const name = (id: string) => nameById.get(id) ?? "A member";
  const label = (id: string) => (id === userId ? "You" : name(id));

  const iAmParty = userId === item.debtorId || userId === item.creditorId;
  const oppId = userId === item.debtorId ? item.creditorId : item.debtorId;
  const settled = !!item.settledAt;
  const reqBy = item.requestedBy;
  const display = item.amount != null ? fmtMoney(item.amount) : item.stake;

  async function call(fn: string, okMsg: string) {
    setBusy(true);
    const { error } = await (supabase as any).rpc(fn, { p_bet_id: item.betId });
    setBusy(false);
    if (error) {
      toast.error(
        /function|does not exist|schema cache/i.test(error.message)
          ? "Settling needs the latest SQL update first."
          : error.message,
      );
      return;
    }
    toast.success(okMsg);
    qc.invalidateQueries({ queryKey: ["friendly-bets"] });
  }

  const btn = "rounded-lg px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-50";

  return (
    <div
      className={`rounded-xl border px-3 py-2 text-sm ${
        settled
          ? "border-border bg-background opacity-80"
          : iAmParty
            ? "border-primary/40 bg-primary/5"
            : "border-border bg-background"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={`truncate font-bold ${!settled && item.debtorId === userId ? "text-magenta" : ""}`}
          >
            {label(item.debtorId)}
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
          <span
            className={`truncate font-bold ${!settled && item.creditorId === userId ? "text-pitch" : ""}`}
          >
            {label(item.creditorId)}
          </span>
        </span>
        <span
          className={`shrink-0 font-bold ${settled ? "text-muted-foreground line-through" : ""}`}
        >
          {display}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{item.label}</p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {settled ? (
          <>
            <span className="text-[11px] font-bold text-pitch">✅ Settled</span>
            {iAmParty && (
              <button
                disabled={busy}
                onClick={() => call("unsettle_friendly_bet", "Reopened.")}
                className={`${btn} border border-border text-muted-foreground hover:bg-secondary`}
              >
                ↺ Undo
              </button>
            )}
          </>
        ) : reqBy ? (
          reqBy === userId ? (
            <>
              <span className="text-[11px] text-muted-foreground">
                ⏳ Waiting for <b className="text-foreground">{name(oppId)}</b> to confirm
              </span>
              <button
                disabled={busy}
                onClick={() => call("unsettle_friendly_bet", "Cancelled.")}
                className={`${btn} border border-border text-muted-foreground hover:bg-secondary`}
              >
                Cancel
              </button>
            </>
          ) : iAmParty ? (
            <>
              <span className="text-[11px] text-muted-foreground">
                <b className="text-foreground">{name(reqBy)}</b> marked this settled
              </span>
              <button
                disabled={busy}
                onClick={() => call("confirm_settle_friendly_bet", "Confirmed — settled. 🤝")}
                className={`${btn} bg-pitch text-white hover:opacity-90`}
              >
                ✓ Confirm
              </button>
              <button
                disabled={busy}
                onClick={() => call("unsettle_friendly_bet", "Declined.")}
                className={`${btn} border border-border text-muted-foreground hover:bg-secondary`}
              >
                Not yet
              </button>
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              ⏳ Awaiting confirmation between {name(item.debtorId)} &amp; {name(item.creditorId)}
            </span>
          )
        ) : iAmParty ? (
          <button
            disabled={busy}
            onClick={() =>
              call("request_settle_friendly_bet", "Marked — waiting on the other player.")
            }
            className={`${btn} bg-pitch text-white hover:opacity-90`}
          >
            ✓ Mark as settled
          </button>
        ) : (
          <span className="text-[11px] text-muted-foreground">Not settled yet</span>
        )}
      </div>
    </div>
  );
}

/** Searchable member picker — type a name instead of scrolling a long list. */
function MemberPicker({
  members,
  value,
  onChange,
}: {
  members: Member[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const selected = members.find((m) => m.id === value);

  if (value && selected) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
        <span className="flex items-center gap-1.5">
          <Target className="size-3.5 text-primary" /> Challenging{" "}
          <span className="font-bold">{selected.display_name ?? "member"}</span>
        </span>
        <button
          onClick={() => onChange("")}
          className="text-xs font-bold text-muted-foreground hover:text-magenta"
        >
          Change
        </button>
      </div>
    );
  }

  const filtered = members
    .filter((m) => (m.display_name ?? "").toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 8);

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Open to anyone — or search a name to challenge"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      {open && q.trim() && (
        <div className="absolute z-20 mt-1 max-h-44 w-full overflow-auto rounded-lg border border-border bg-surface shadow-card">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">No members found.</p>
          ) : (
            filtered.map((m) => (
              <button
                key={m.id}
                onMouseDown={() => {
                  onChange(m.id);
                  setOpen(false);
                  setQ("");
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-primary/5"
              >
                Challenge <span className="font-semibold">{m.display_name ?? "member"}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** Shared form for offering a new bet and for editing an existing one. */
function BetForm({
  teamA,
  teamB,
  members,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  teamA: Team | null;
  teamB: Team | null;
  members: Member[];
  initial?: Partial<FormValues>;
  submitLabel?: string;
  onSubmit: (v: FormValues) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [teamId, setTeamId] = useState(initial?.teamId ?? "");
  const [stake, setStake] = useState(initial?.stake ?? "");
  const [targetId, setTargetId] = useState(initial?.targetId ?? "");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!teamId || !stake.trim()) return toast.error("Pick a team and enter a stake.");
    setBusy(true);
    const ok = await onSubmit({ teamId, stake: stake.trim(), targetId });
    setBusy(false);
    if (ok && !onCancel) {
      setTeamId("");
      setStake("");
      setTargetId("");
    }
  }

  const label = submitLabel ?? (targetId ? "Send challenge" : "Offer bet");

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {[teamA, teamB].map(
          (t) =>
            t && (
              <button
                key={t.id}
                onClick={() => setTeamId(t.id)}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold transition ${
                  teamId === t.id
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-primary"
                }`}
              >
                {t.flag_emoji} {t.name}
              </button>
            ),
        )}
      </div>
      <input
        value={stake}
        onChange={(e) => setStake(e.target.value)}
        placeholder="Your stake — e.g. Rs. 500, or loser buys momo 🥟"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <MemberPicker members={members} value={targetId} onChange={setTargetId} />
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={busy}
          className="flex-1 rounded-xl bg-pitch px-3 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : label}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="rounded-xl border border-border px-3 py-2 text-sm font-bold text-muted-foreground transition hover:bg-secondary"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function GameCard({
  match,
  bets,
  userId,
  members,
  nameById,
  hidden,
  onHide,
  disabled,
}: {
  match: Match;
  bets: Bet[];
  userId: string;
  members: Member[];
  nameById: Map<string, string>;
  hidden: Set<string>;
  onHide: (id: string) => void;
  disabled: boolean;
}) {
  const qc = useQueryClient();
  const a = match.team_a;
  const b = match.team_b;
  const started = Date.parse(match.kickoff_utc) <= Date.now();
  const finished = match.status === "finished";
  const refresh = () => qc.invalidateQueries({ queryKey: ["friendly-bets"] });
  const myBet = bets.find((x) => x.proposer_id === userId);
  // Hide rejected offers (except to their proposer) and ones you've passed on.
  const visible = bets.filter(
    (x) =>
      (x.status !== "rejected" || x.proposer_id === userId) &&
      (!hidden.has(x.id) || x.proposer_id === userId),
  );

  async function offer(v: FormValues): Promise<boolean> {
    const payload: Record<string, unknown> = {
      match_id: match.id,
      proposer_id: userId,
      proposer_team_id: v.teamId,
      stake: v.stake,
    };
    if (v.targetId) payload.target_id = v.targetId;
    const { error } = await (supabase as any).from("friendly_bets").insert(payload);
    if (error) {
      if (/target_id|column/i.test(error.message))
        toast.error("Directed bets need the latest SQL update first.");
      else toast.error(error.message);
      return false;
    }
    toast.success(v.targetId ? "Challenge sent — waiting for them to approve." : "Bet offered.");
    refresh();
    return true;
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-bold">
          <span className="text-lg">{a?.flag_emoji ?? "🏳️"}</span>
          <span className="truncate">{a?.name ?? "TBD"}</span>
          <span className="text-muted-foreground">v</span>
          <span className="truncate">{b?.name ?? "TBD"}</span>
          <span className="text-lg">{b?.flag_emoji ?? "🏳️"}</span>
        </div>
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          {finished
            ? "FT"
            : `${formatNPTDate(match.kickoff_utc)} · ${formatNPT(match.kickoff_utc)}`}
        </span>
      </div>

      <div className="mt-3 space-y-3 border-t border-border pt-3">
        {visible.map((bet) => (
          <BetRow
            key={bet.id}
            bet={bet}
            match={match}
            userId={userId}
            members={members}
            nameById={nameById}
            started={started}
            finished={finished}
            onChange={refresh}
            onHide={onHide}
          />
        ))}

        {!myBet && !started && !disabled && (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {bets.length ? "Add your own bet" : "Be the first — offer a bet"}
            </p>
            <BetForm teamA={a} teamB={b} members={members} onSubmit={offer} />
          </div>
        )}

        {!bets.length && started && (
          <p className="text-sm text-muted-foreground">Betting closed — this match has started.</p>
        )}
      </div>
    </div>
  );
}

function BetRow({
  bet,
  match,
  userId,
  members,
  nameById,
  started,
  finished,
  onChange,
  onHide,
}: {
  bet: Bet;
  match: Match;
  userId: string;
  members: Member[];
  nameById: Map<string, string>;
  started: boolean;
  finished: boolean;
  onChange: () => void;
  onHide: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const a = match.team_a;
  const b = match.team_b;
  const proposerTeam = bet.team;
  const otherTeam = a && b ? (bet.proposer_team_id === a.id ? b : a) : null;
  const mine = bet.proposer_id === userId;
  const proposerName = nameById.get(bet.proposer_id) ?? "A member";
  const acceptorName = bet.acceptor_id ? (nameById.get(bet.acceptor_id) ?? "A member") : "A member";
  const targetName = bet.target_id ? (nameById.get(bet.target_id) ?? "a member") : null;
  const iAmTarget = bet.target_id === userId;
  const wonByProposer = finished && match.winner_team_id === bet.proposer_team_id;
  const wonByAcceptor = finished && !!bet.acceptor_id && match.winner_team_id === otherTeam?.id;

  async function remove() {
    setBusy(true);
    const { error } = await (supabase as any).from("friendly_bets").delete().eq("id", bet.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.message("Removed.");
    onChange();
  }
  async function accept() {
    setBusy(true);
    const { error } = await (supabase as any).rpc("accept_friendly_bet", { p_bet_id: bet.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Bet accepted & locked. 🤝");
    onChange();
  }
  async function reject() {
    // Open offer aimed at no one in particular → just pass on it (hide from your
    // own list; it stays live for the rest of the pool).
    if (!iAmTarget) {
      onHide(bet.id);
      toast.message("Passed — hidden from your list.");
      return;
    }
    // A challenge addressed to you → formally decline it (the proposer is told).
    setBusy(true);
    const { error } = await (supabase as any).rpc("reject_friendly_bet", { p_bet_id: bet.id });
    setBusy(false);
    if (error)
      return toast.error(
        /function|does not exist/i.test(error.message)
          ? "Reject needs the latest SQL update first."
          : error.message,
      );
    toast.message("Challenge rejected.");
    onChange();
  }
  async function saveEdit(v: FormValues): Promise<boolean> {
    const { data, error } = await (supabase as any)
      .from("friendly_bets")
      .update({ proposer_team_id: v.teamId, stake: v.stake, target_id: v.targetId || null })
      .eq("id", bet.id)
      .select();
    if (error) {
      toast.error(error.message);
      return false;
    }
    if (!data?.length) {
      toast.error("Editing needs the latest SQL update first.");
      return false;
    }
    toast.success("Bet updated.");
    setEditing(false);
    onChange();
    return true;
  }

  // ---- accepted / locked ----
  if (bet.status === "accepted") {
    return (
      <div className="rounded-xl border border-border bg-background p-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-primary">
          <Lock className="size-3" /> Locked
        </div>
        <p className="mt-1 text-sm">
          <span className="font-bold">{proposerName}</span> {proposerTeam?.flag_emoji}
          <span className="text-muted-foreground"> vs </span>
          <span className="font-bold">{acceptorName}</span> {otherTeam?.flag_emoji}
        </p>
        <p className="text-xs text-muted-foreground">
          Stake: <span className="font-semibold text-foreground">{bet.stake}</span>
        </p>
        {finished && (wonByProposer || wonByAcceptor) && (
          <p className="mt-1 flex items-center gap-1 text-xs font-bold text-accent">
            <Trophy className="size-3.5" /> {wonByProposer ? proposerName : acceptorName} wins!
          </p>
        )}
      </div>
    );
  }

  // ---- rejected (only the proposer sees this) ----
  if (bet.status === "rejected") {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background p-2.5">
        <p className="min-w-0 text-sm text-muted-foreground">
          {targetName ? <b>{targetName}</b> : "Someone"} declined your bet ·{" "}
          <span className="font-semibold">{bet.stake}</span>
        </p>
        <button
          onClick={remove}
          disabled={busy}
          className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs font-bold text-muted-foreground hover:border-primary disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
    );
  }

  // ---- editing my open bet ----
  if (editing) {
    return (
      <div className="rounded-xl border border-primary/40 bg-primary/5 p-2.5">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">Edit your bet</p>
        <BetForm
          teamA={a}
          teamB={b}
          members={members}
          initial={{
            teamId: bet.proposer_team_id ?? "",
            stake: bet.stake,
            targetId: bet.target_id ?? "",
          }}
          submitLabel="Save changes"
          onSubmit={saveEdit}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  // ---- open offer ----
  const canAccept = !mine && !started && (bet.target_id == null || iAmTarget);
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-xl border border-dashed p-2.5 ${
        iAmTarget ? "border-primary bg-primary/5" : "border-border bg-background"
      }`}
    >
      <div className="min-w-0 text-sm">
        {iAmTarget && (
          <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
            <Target className="size-3" /> Challenge for you
          </span>
        )}
        <p>
          <span className="font-bold">{mine ? "You" : proposerName}</span> back{" "}
          {proposerTeam?.flag_emoji} {proposerTeam?.name}
          {targetName && (
            <>
              <span className="text-muted-foreground"> · challenging </span>
              <span className="font-semibold">{iAmTarget ? "you" : targetName}</span>
            </>
          )}
          <span className="text-muted-foreground"> · </span>
          <span className="font-semibold">{bet.stake}</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {mine ? (
          <>
            {!started && (
              <button
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-bold text-muted-foreground hover:border-primary hover:text-foreground"
              >
                <Pencil className="size-3" /> Edit
              </button>
            )}
            <button
              onClick={remove}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-bold text-muted-foreground hover:border-magenta hover:text-magenta disabled:opacity-50"
            >
              <X className="size-3" /> Cancel
            </button>
          </>
        ) : canAccept ? (
          <>
            <button
              onClick={accept}
              disabled={busy}
              className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              Accept · {otherTeam?.flag_emoji}
            </button>
            <button
              onClick={reject}
              disabled={busy}
              title={iAmTarget ? "Decline this challenge" : "Pass — hide from your list"}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:border-magenta hover:text-magenta disabled:opacity-50"
            >
              Reject
            </button>
          </>
        ) : started ? (
          <span className="text-[10px] font-semibold text-muted-foreground">Closed</span>
        ) : (
          <span className="text-[10px] font-semibold text-muted-foreground">
            waiting for {targetName}
          </span>
        )}
      </div>
    </div>
  );
}
