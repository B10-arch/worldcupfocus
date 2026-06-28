import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatNPTDate, formatNPT } from "@/lib/time";
import { toast } from "sonner";
import { Handshake, Lock, Trophy, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/friendly")({
  head: () => ({ meta: [{ title: "Friendly Bets · Focus World Cup Pool" }] }),
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
  stake: string;
  status: string;
  proposer: { display_name: string | null } | null;
  acceptor: { display_name: string | null } | null;
  team: Team | null;
};

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
        .select(
          "*, proposer:profiles!friendly_bets_proposer_id_fkey(display_name), acceptor:profiles!friendly_bets_acceptor_id_fkey(display_name), team:teams!friendly_bets_proposer_team_id_fkey(id,name,flag_emoji,code)",
        );
      if (error) throw error;
      return (data ?? []) as Bet[];
    },
  });

  const betByMatch = new Map<string, Bet>();
  for (const b of betsQ.data ?? []) betByMatch.set(b.match_id, b);

  const notSetUp =
    betsQ.isError && /relation|does not exist|friendly_bets/i.test(String(betsQ.error));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-display text-4xl font-bold">
          <Handshake className="size-8 text-primary" /> Friendly Bets
        </h1>
        <p className="mt-2 text-muted-foreground">
          Offer a bet on a Round of 32 game — pick a team and name your stake (money or a dare).
          Anyone in the pool can take it. Once someone accepts, it locks. One bet per game.
        </p>
      </header>

      {notSetUp && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/5 p-4 text-sm">
          <p className="font-bold text-foreground">⚙️ One-time setup needed</p>
          <p className="mt-1 text-muted-foreground">
            Friendly bets need a small database table. Run the SQL in{" "}
            <span className="font-mono text-xs">
              supabase/migrations/20260628000000_friendly_bets.sql
            </span>{" "}
            in your Supabase SQL editor, then refresh.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {(matchesQ.data ?? []).map((m) => (
          <BetCard key={m.id} match={m} bet={betByMatch.get(m.id)} userId={user.id} />
        ))}
      </div>
    </div>
  );
}

function BetCard({ match, bet, userId }: { match: Match; bet?: Bet; userId: string }) {
  const qc = useQueryClient();
  const [teamId, setTeamId] = useState<string>("");
  const [stake, setStake] = useState("");
  const [busy, setBusy] = useState(false);

  const a = match.team_a;
  const b = match.team_b;
  const started = Date.parse(match.kickoff_utc) <= Date.now();
  const finished = match.status === "finished";
  const refresh = () => qc.invalidateQueries({ queryKey: ["friendly-bets"] });

  // Who backs which team, and (if finished) who won the bet.
  const proposerTeam = bet?.team ?? null;
  const otherTeam = bet && a && b ? (bet.proposer_team_id === a.id ? b : a) : null;
  const wonByProposer = finished && bet && match.winner_team_id === bet.proposer_team_id;
  const wonByAcceptor =
    finished && bet && bet.acceptor_id && match.winner_team_id === otherTeam?.id;

  async function offer() {
    if (!teamId || !stake.trim()) {
      toast.error("Pick a team and enter a stake.");
      return;
    }
    setBusy(true);
    const { error } = await (supabase as any).from("friendly_bets").insert({
      match_id: match.id,
      proposer_id: userId,
      proposer_team_id: teamId,
      stake: stake.trim(),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Bet offered — waiting for someone to take it.");
    setStake("");
    setTeamId("");
    refresh();
  }

  async function cancel() {
    setBusy(true);
    const { error } = await (supabase as any).from("friendly_bets").delete().eq("id", bet!.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.message("Offer cancelled.");
    refresh();
  }

  async function accept() {
    setBusy(true);
    const { error } = await (supabase as any).rpc("accept_friendly_bet", { p_bet_id: bet!.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Bet accepted & locked. Good luck! 🤝");
    refresh();
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
      {/* matchup header */}
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

      <div className="mt-3 border-t border-border pt-3">
        {/* ---- Accepted / locked ---- */}
        {bet?.status === "accepted" ? (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
              <Lock className="size-3.5" /> Locked bet
            </div>
            <p className="text-sm">
              <span className="font-bold">{bet.proposer?.display_name ?? "A member"}</span> on{" "}
              {proposerTeam?.flag_emoji} {proposerTeam?.name}
              <span className="text-muted-foreground"> vs </span>
              <span className="font-bold">{bet.acceptor?.display_name ?? "A member"}</span> on{" "}
              {otherTeam?.flag_emoji} {otherTeam?.name}
            </p>
            <p className="text-sm text-muted-foreground">
              Stake: <span className="font-semibold text-foreground">{bet.stake}</span>
            </p>
            {finished && (wonByProposer || wonByAcceptor) && (
              <p className="flex items-center gap-1.5 text-sm font-bold text-accent">
                <Trophy className="size-4" />{" "}
                {wonByProposer ? bet.proposer?.display_name : bet.acceptor?.display_name} wins the
                bet!
              </p>
            )}
          </div>
        ) : bet ? (
          /* ---- Open offer ---- */
          bet.proposer_id === userId ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Your offer · backing{" "}
                <span className="font-semibold text-foreground">
                  {proposerTeam?.flag_emoji} {proposerTeam?.name}
                </span>{" "}
                · <span className="font-semibold text-foreground">{bet.stake}</span> · waiting for
                an opponent
              </p>
              <button
                onClick={cancel}
                disabled={busy}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-bold text-muted-foreground hover:border-magenta hover:text-magenta disabled:opacity-50"
              >
                <X className="size-3" /> Cancel
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm">
                <span className="font-bold">{bet.proposer?.display_name ?? "A member"}</span> backs{" "}
                <span className="font-semibold">
                  {proposerTeam?.flag_emoji} {proposerTeam?.name}
                </span>{" "}
                · stake <span className="font-semibold">{bet.stake}</span>
              </p>
              {started ? (
                <p className="text-xs font-semibold text-muted-foreground">
                  Match has started — too late to take this one.
                </p>
              ) : (
                <button
                  onClick={accept}
                  disabled={busy}
                  className="w-full rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                >
                  Accept — you back {otherTeam?.flag_emoji} {otherTeam?.name}
                </button>
              )}
            </div>
          )
        ) : started ? (
          /* ---- No bet, match started ---- */
          <p className="text-sm text-muted-foreground">Betting closed — this match has started.</p>
        ) : (
          /* ---- No bet, offer form ---- */
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Offer a bet — pick your team
            </p>
            <div className="flex gap-2">
              {[a, b].map(
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
            <button
              onClick={offer}
              disabled={busy}
              className="w-full rounded-xl bg-pitch px-3 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              Offer bet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
