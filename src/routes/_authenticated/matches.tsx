import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatNPT, formatNPTDate, isTournamentStarted } from "@/lib/time";
import { MatchHighlights } from "@/components/MatchHighlights";

export const Route = createFileRoute("/_authenticated/matches")({
  head: () => ({ meta: [{ title: "Matches · Focus World Cup Pool" }] }),
  component: MatchesPage,
});

function MatchesPage() {
  const { data: matches } = useQuery({
    queryKey: ["matches", "all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("matches")
        .select("*, team_a:teams!matches_team_a_id_fkey(*), team_b:teams!matches_team_b_id_fkey(*)")
        .order("kickoff_utc");
      return data ?? [];
    },
  });

  // Group: confirmed matches by NPT date; everything else under "Time TBC".
  const confirmed = (matches ?? []).filter((m) => !m.time_tbc);
  const tbc = (matches ?? []).filter((m) => m.time_tbc);

  const grouped = confirmed.reduce<Record<string, typeof confirmed>>((acc, m) => {
    const day = formatNPTDate(m.kickoff_utc);
    acc[day] = acc[day] ?? [];
    acc[day]!.push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-10">
      <header>
        <h2 className="font-display text-4xl font-bold">Match schedule</h2>
        <p className="mt-2 text-muted-foreground">
          All kickoff times converted to Nepal Standard Time (UTC +5:45).
          {!isTournamentStarted() &&
            " The tournament has not started yet — no scores will appear until matches kick off."}
        </p>
      </header>

      {Object.entries(grouped).map(([day, list]) => (
        <Section key={day} title={day} list={list!} />
      ))}

      {tbc.length > 0 && (
        <Section
          title="Time TBC"
          subtitle="Fixture confirmed; kickoff time will be published by FIFA closer to the date."
          list={tbc}
          hideTime
        />
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  list,
  hideTime,
}: {
  title: string;
  subtitle?: string;
  list: any[];
  hideTime?: boolean;
}) {
  return (
    <section>
      <h3 className="mb-1 font-display text-xl font-bold">{title}</h3>
      {subtitle && <p className="mb-3 text-xs text-muted-foreground">{subtitle}</p>}
      <div className="space-y-2">
        {list.map((m) => (
          <MatchRow key={m.id} m={m} hideTime={hideTime} />
        ))}
      </div>
    </section>
  );
}

/** A single match as a responsive card: meta + status on top, teams below. */
function MatchRow({ m, hideTime }: { m: any; hideTime?: boolean }) {
  const played = m.status === "finished";
  const stage = m.stage === "group" ? `Group ${m.group_name}` : String(m.stage).toUpperCase();
  return (
    <div className="rounded-2xl border border-border bg-surface p-3 shadow-card sm:px-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {hideTime ? "Time TBC" : formatNPT(m.kickoff_utc)} · {stage}
          {m.venue ? ` · ${m.venue}` : ""}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {m.status === "live" ? (
            <span className="rounded-full bg-magenta/10 px-2 py-0.5 text-[10px] font-bold text-magenta">
              LIVE
            </span>
          ) : played ? (
            <span className="text-[10px] font-bold text-muted-foreground">FT</span>
          ) : (
            <span className="text-[10px] font-bold text-primary">UPCOMING</span>
          )}
          {(played || (m.highlights_url ?? "").trim()) && <MatchHighlights match={m} compact />}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-2xl">{m.team_a?.flag_emoji ?? "🏳️"}</span>
        <span className="min-w-0 flex-1 truncate font-semibold">{m.team_a?.name ?? "TBD"}</span>
        {played ? (
          <span className="shrink-0 rounded bg-muted px-2 py-0.5 font-mono text-sm font-bold">
            {m.score_a}–{m.score_b}
          </span>
        ) : (
          <span className="shrink-0 px-1 text-xs text-muted-foreground">vs</span>
        )}
        <span className="min-w-0 flex-1 truncate text-right font-semibold">
          {m.team_b?.name ?? "TBD"}
        </span>
        <span className="text-2xl">{m.team_b?.flag_emoji ?? "🏳️"}</span>
      </div>
    </div>
  );
}
