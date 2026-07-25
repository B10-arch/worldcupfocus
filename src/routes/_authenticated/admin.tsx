import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatNPR, formatNPTFull, isBetLocked } from "@/lib/time";
import { toast } from "sonner";
import { ShieldCheck, Users, Wallet, Trophy, Search, Download, Lock, Unlock } from "lucide-react";
import { LiveStreamAdmin } from "@/components/LiveStreamAdmin";
import { MatchHighlightsAdmin } from "@/components/MatchHighlightsAdmin";
import { MatchEventsAdmin } from "@/components/MatchEventsAdmin";

const ENTRY_FEE = 1000;

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin · Focus Premier League Pool" }] }),
  beforeLoad: async ({ context }) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!data) throw redirect({ to: "/dashboard" });
  },
  component: AdminPage,
});

type Pick = {
  bet_id: string;
  team_id: string;
  team_name: string | null;
  team_flag: string | null;
  team_group: string | null;
  fifa_rank: number | null;
  placed_at: string;
  points: number;
};

type Row = {
  user_id: string;
  display_name: string;
  payment_status: string;
  profile_created_at: string;
  picks: Pick[];
  confirmed_at: string | null;
  total_points: number;
};

function AdminPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterPayment, setFilterPayment] = useState<"all" | "paid" | "pending">("all");
  const [filterTeam, setFilterTeam] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "confirmed" | "registered" | "points">(
    "registered",
  );
  const [tab, setTab] = useState<"registrations" | "backers">("registrations");

  const { data: rows = [], isLoading } = useQuery<Row[]>({
    queryKey: ["admin", "rows"],
    queryFn: async () => {
      const [profilesRes, betsRes, teamsRes] = await Promise.all([
        supabase.from("profiles").select("*"),
        supabase.from("bets").select("*"),
        supabase.from("teams").select("*"),
      ]);
      const profiles = profilesRes.data ?? [];
      const bets = betsRes.data ?? [];
      const teams = teamsRes.data ?? [];
      const teamMap = new Map(teams.map((t) => [t.id, t]));
      const betsByUser = new Map<string, typeof bets>();
      for (const b of bets) {
        const list = betsByUser.get(b.user_id) ?? [];
        list.push(b);
        betsByUser.set(b.user_id, list);
      }
      return profiles.map((p) => {
        const userBets = (betsByUser.get(p.id) ?? []).sort((a, b) =>
          a.placed_at.localeCompare(b.placed_at),
        );
        const picks: Pick[] = userBets.map((b) => {
          const t = teamMap.get(b.team_id);
          return {
            bet_id: b.id,
            team_id: b.team_id,
            team_name: t?.name ?? null,
            team_flag: t?.flag_emoji ?? null,
            team_group: t?.group_name ?? null,
            fifa_rank: t?.fifa_rank ?? null,
            placed_at: b.placed_at,
            points: b.points,
          };
        });
        return {
          user_id: p.id,
          display_name: p.display_name,
          payment_status: p.payment_status,
          profile_created_at: p.created_at,
          picks,
          confirmed_at: picks.length === 3 ? picks[picks.length - 1].placed_at : null,
          total_points: picks.reduce((s, x) => s + (x.points ?? 0), 0),
        };
      });
    },
  });

  const teamsList = useMemo(() => {
    const set = new Map<string, { name: string; flag: string }>();
    rows.forEach((r) =>
      r.picks.forEach((p) => {
        if (p.team_id) set.set(p.team_id, { name: p.team_name ?? "", flag: p.team_flag ?? "" });
      }),
    );
    return Array.from(set.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [rows]);

  const filtered = useMemo(() => {
    let out = rows;
    if (search) {
      const q = search.toLowerCase();
      out = out.filter(
        (r) =>
          r.display_name.toLowerCase().includes(q) ||
          r.picks.some((p) => (p.team_name ?? "").toLowerCase().includes(q)),
      );
    }
    if (filterPayment !== "all") out = out.filter((r) => r.payment_status === filterPayment);
    if (filterTeam !== "all")
      out = out.filter((r) => r.picks.some((p) => p.team_id === filterTeam));
    out = [...out].sort((a, b) => {
      if (sortBy === "name") return a.display_name.localeCompare(b.display_name);
      if (sortBy === "points") return b.total_points - a.total_points;
      if (sortBy === "confirmed") return (a.confirmed_at ?? "").localeCompare(b.confirmed_at ?? "");
      return b.profile_created_at.localeCompare(a.profile_created_at);
    });
    return out;
  }, [rows, search, filterPayment, filterTeam, sortBy]);

  const summary = useMemo(() => {
    const total = rows.length;
    const paid = rows.filter((r) => r.payment_status === "paid").length;
    const unpaid = total - paid;
    const totalPicks = rows.reduce((s, r) => s + r.picks.length, 0);
    const paidPicks = rows
      .filter((r) => r.payment_status === "paid")
      .reduce((s, r) => s + r.picks.length, 0);
    const collected = paidPicks * ENTRY_FEE;
    const expected = totalPicks * ENTRY_FEE;
    const counts = new Map<string, number>();
    rows.forEach((r) =>
      r.picks.forEach((p) => counts.set(p.team_id, (counts.get(p.team_id) ?? 0) + 1)),
    );
    let topTeamId: string | null = null;
    let topCount = 0;
    counts.forEach((c, id) => {
      if (c > topCount) {
        topCount = c;
        topTeamId = id;
      }
    });
    const topTeam = topTeamId
      ? (rows.flatMap((r) => r.picks).find((p) => p.team_id === topTeamId) ?? null)
      : null;
    const distinctTeams = counts.size;
    const underdogPicks = rows
      .flatMap((r) => r.picks)
      .filter((p) => (p.fifa_rank ?? 0) > 15).length;
    return {
      total,
      paid,
      unpaid,
      collected,
      expected,
      totalPicks,
      distinctTeams,
      topTeam,
      topCount,
      underdogPicks,
    };
  }, [rows]);

  const backers = useMemo(() => {
    const groups = new Map<
      string,
      {
        team_name: string | null;
        team_flag: string | null;
        team_group: string | null;
        fifa_rank: number | null;
        list: Array<{ user_id: string; display_name: string; payment_status: string }>;
      }
    >();
    rows.forEach((r) =>
      r.picks.forEach((p) => {
        const g = groups.get(p.team_id) ?? {
          team_name: p.team_name,
          team_flag: p.team_flag,
          team_group: p.team_group,
          fifa_rank: p.fifa_rank,
          list: [] as Array<{ user_id: string; display_name: string; payment_status: string }>,
        };
        g.list.push({
          user_id: r.user_id,
          display_name: r.display_name,
          payment_status: r.payment_status,
        });
        groups.set(p.team_id, g);
      }),
    );
    return Array.from(groups.entries())
      .map(([team_id, g]) => ({
        team_id,
        ...g,
        backers: g.list.length,
        paid: g.list.filter((u) => u.payment_status === "paid").length,
      }))
      .sort((a, b) => b.backers - a.backers);
  }, [rows]);

  async function togglePayment(userId: string, current: string) {
    const next = current === "paid" ? "pending" : "paid";
    const { error } = await supabase
      .from("profiles")
      .update({ payment_status: next })
      .eq("id", userId);
    if (error) toast.error(error.message);
    else {
      toast.success(`Marked ${next}`);
      qc.invalidateQueries({ queryKey: ["admin"] });
    }
  }

  function exportCsv() {
    const headers = [
      "name",
      "registered_at_npt",
      "picks_count",
      "team_1",
      "team_2",
      "team_3",
      "confirmed_at_npt",
      "locked",
      "payment_status",
      "amount_due",
      "total_points",
    ];
    const lines = [headers.join(",")];
    filtered.forEach((r) => {
      const names = r.picks.map((p) => p.team_name ?? "");
      while (names.length < 3) names.push("");
      lines.push(
        [
          quote(r.display_name),
          quote(r.profile_created_at ? formatNPTFull(r.profile_created_at) : ""),
          r.picks.length,
          quote(names[0]),
          quote(names[1]),
          quote(names[2]),
          quote(r.confirmed_at ? formatNPTFull(r.confirmed_at) : ""),
          r.picks.length > 0 ? (isBetLocked() ? "true" : "false") : "",
          r.payment_status,
          ENTRY_FEE * r.picks.length,
          r.total_points,
        ].join(","),
      );
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `unicorn-pool-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-display text-4xl font-bold">
            <ShieldCheck className="size-8 text-primary" /> Admin
          </h1>
          <p className="mt-2 text-muted-foreground">
            Pool operations console. Visible to admin role only — participants see only the public
            leaderboard.
          </p>
        </div>
        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-bold hover:bg-secondary"
        >
          <Download className="size-4" /> Export CSV
        </button>
      </header>

      <LiveStreamAdmin />

      <MatchEventsAdmin />

      <MatchHighlightsAdmin />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={<Users className="size-4" />}
          label="Participants"
          value={summary.total}
        />
        <SummaryCard
          icon={<Wallet className="size-4" />}
          label="Collected pot"
          value={`Rs. ${formatNPR(summary.collected)}`}
          sub={`${summary.paid} paid · ${summary.unpaid} unpaid`}
        />
        <SummaryCard
          icon={<Trophy className="size-4" />}
          label="Teams backed"
          value={summary.distinctTeams}
          sub={
            summary.topTeam
              ? `Top: ${summary.topTeam.team_flag} ${summary.topTeam.team_name} (${summary.topCount})`
              : "No bets yet"
          }
        />
        <SummaryCard
          icon={<ShieldCheck className="size-4" />}
          label="Underdog picks"
          value={summary.underdogPicks}
          sub="FIFA rank > 15"
        />
      </div>

      <div className="flex gap-2 border-b border-border">
        {(["registrations", "backers"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-bold capitalize ${
              tab === t ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"
            }`}
          >
            {t === "registrations" ? "Registrations" : "Backers by team"}
          </button>
        ))}
      </div>

      {tab === "registrations" && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or team…"
                className="w-full rounded-xl border border-border bg-surface py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <select
              value={filterPayment}
              onChange={(e) => setFilterPayment(e.target.value as "all" | "paid" | "pending")}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="all">All payments</option>
              <option value="paid">Paid</option>
              <option value="pending">Unpaid</option>
            </select>
            <select
              value={filterTeam}
              onChange={(e) => setFilterTeam(e.target.value)}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="all">All teams</option>
              {teamsList.map(([id, t]) => (
                <option key={id} value={id}>
                  {t.flag} {t.name}
                </option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="registered">Sort: newest signup</option>
              <option value="confirmed">Sort: earliest confirmed 3-pick</option>
              <option value="points">Sort: total points</option>
              <option value="name">Sort: name A–Z</option>
            </select>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Player</th>
                  <th className="px-4 py-3">Registered (NPT)</th>
                  <th className="px-4 py-3">Teams backed</th>
                  <th className="px-4 py-3">Confirmed (NPT)</th>
                  <th className="px-4 py-3">Locked</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                )}
                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      No records.
                    </td>
                  </tr>
                )}
                {filtered.map((r) => (
                  <tr key={r.user_id} className="hover:bg-muted/40">
                    <td className="px-4 py-3 font-bold">{r.display_name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatNPTFull(r.profile_created_at)}
                    </td>
                    <td className="px-4 py-3">
                      {r.picks.length === 0 ? (
                        <span className="text-xs text-muted-foreground">— no picks —</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {r.picks.map((p) => (
                            <span
                              key={p.bet_id}
                              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                              title={`${p.team_name} · Group ${p.team_group} · FIFA #${p.fifa_rank}`}
                            >
                              <span className="text-base leading-none">{p.team_flag}</span>
                              {p.team_name}
                            </span>
                          ))}
                          {r.picks.length < 3 && (
                            <span className="text-[10px] uppercase text-muted-foreground">
                              {r.picks.length}/3
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {r.confirmed_at ? formatNPTFull(r.confirmed_at) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {r.picks.length > 0 ? (
                        isBetLocked() ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-magenta">
                            <Lock className="size-3" /> Locked
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Unlock className="size-3" /> Open
                          </span>
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <PaymentBadge status={r.payment_status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => togglePayment(r.user_id, r.payment_status)}
                        className="rounded-full border border-border px-3 py-1 text-xs font-bold hover:bg-secondary"
                      >
                        Mark {r.payment_status === "paid" ? "unpaid" : "paid"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "backers" && (
        <div className="space-y-4">
          {backers.length === 0 && <p className="text-muted-foreground">No bets placed yet.</p>}
          {backers.map((g) => {
            const splitShare = g.backers > 1 ? `Pot splits ${g.backers} ways` : "Solo backer";
            return (
              <div
                key={g.team_id}
                className="rounded-2xl border border-border bg-surface p-4 shadow-card"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{g.team_flag}</span>
                    <div>
                      <p className="font-display text-lg font-bold">
                        {g.team_name}{" "}
                        <span className="text-xs text-muted-foreground">
                          · Group {g.team_group} · FIFA #{g.fifa_rank}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {g.backers} backer{g.backers === 1 ? "" : "s"} · {g.paid} paid ·{" "}
                        {splitShare}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                    {g.backers}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {g.list.map((p) => (
                    <span
                      key={p.user_id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs"
                    >
                      {p.display_name}
                      <PaymentBadge status={p.payment_status} compact />
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {icon} {label}
      </div>
      <p className="mt-2 font-display text-2xl font-bold">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function PaymentBadge({ status, compact }: { status: string; compact?: boolean }) {
  const paid = status === "paid";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 ${
        compact ? "text-[10px]" : "text-xs"
      } font-bold uppercase ${paid ? "bg-pitch/15 text-pitch" : "bg-magenta/15 text-magenta"}`}
    >
      {paid ? "Paid" : "Unpaid"}
    </span>
  );
}

function quote(s: string) {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
