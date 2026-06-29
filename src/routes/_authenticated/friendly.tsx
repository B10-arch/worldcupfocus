import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatNPTDate, formatNPT } from "@/lib/time";
import { toast } from "sonner";
import { Handshake, Lock, Trophy, X, Target, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/friendly")({
  head: () => ({ meta: [{ title: "Side Bets · Focus World Cup Pool" }] }),
  component: FriendlyBetsPage,
});

type Team = { id: string; name: string | null; flag_emoji: string | null; code: string | null };
type Match = {
  id: string;
  kickoff_utc: string;
  status: string;
  winner_team_id: string | null;
  team_a: Team | null;
  team_b: Team | null;
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
  team: Team | null;
};
type Member = { id: string; display_name: string | null };
type FormValues = { teamId: string; stake: string; targetId: string };

function FriendlyBetsPage() {
  const { user } = Route.useRouteContext();

  const matchesQ = useQuery({
    queryKey: ["friendly-matches"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("matches")
        .select(
          "id, kickoff_utc, status, winner_team_id, team_a:teams!matches_team_a_id_fkey(id,name,flag_emoji,code), team_b:teams!matches_team_b_id_fkey(id,name,flag_emoji,code)",
        )
        .eq("stage", "r32")
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
        .order("created_at");
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

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-display text-4xl font-bold">
          <Handshake className="size-8 text-primary" /> Side Bets
        </h1>
        <p className="mt-2 text-muted-foreground">
          Offer a bet on a Round of 32 game — pick a team and name your stake (money or a dare).
          Leave it open for anyone, or{" "}
          <span className="font-semibold text-foreground">challenge a specific member</span> (they
          can accept or reject). Edit or cancel your own offers anytime before kickoff.
        </p>
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

      <div className="grid gap-4 md:grid-cols-2">
        {(matchesQ.data ?? []).map((m) => (
          <GameCard
            key={m.id}
            match={m}
            bets={betsByMatch.get(m.id) ?? []}
            userId={user.id}
            members={(membersQ.data ?? []).filter((mem) => mem.id !== user.id)}
            nameById={nameById}
            disabled={notSetUp}
          />
        ))}
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
  disabled,
}: {
  match: Match;
  bets: Bet[];
  userId: string;
  members: Member[];
  nameById: Map<string, string>;
  disabled: boolean;
}) {
  const qc = useQueryClient();
  const a = match.team_a;
  const b = match.team_b;
  const started = Date.parse(match.kickoff_utc) <= Date.now();
  const finished = match.status === "finished";
  const refresh = () => qc.invalidateQueries({ queryKey: ["friendly-bets"] });
  const myBet = bets.find((x) => x.proposer_id === userId);
  // Rejected offers are only shown to their own proposer.
  const visible = bets.filter((x) => x.status !== "rejected" || x.proposer_id === userId);

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
}: {
  bet: Bet;
  match: Match;
  userId: string;
  members: Member[];
  nameById: Map<string, string>;
  started: boolean;
  finished: boolean;
  onChange: () => void;
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
            {iAmTarget && (
              <button
                onClick={reject}
                disabled={busy}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:border-magenta hover:text-magenta disabled:opacity-50"
              >
                Reject
              </button>
            )}
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
