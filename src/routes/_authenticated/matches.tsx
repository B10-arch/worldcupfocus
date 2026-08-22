import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatNPT, formatNPTDate, isTournamentStarted } from "@/lib/time";
import { MatchHighlights } from "@/components/MatchHighlights";
import { Crest } from "@/components/Crest";
import { ChevronDown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/matches")({
  head: () => ({ meta: [{ title: "Matches · Focus Premier League Pool" }] }),
  component: MatchesPage,
});

// Calendar-day index in Nepal time (UTC +5:45), for bucketing matches into days
// and comparing against "today" so the listing rolls over automatically.
const NPT_OFFSET_MS = (5 * 60 + 45) * 60 * 1000;
const nptDayIndex = (utc: string | number | Date) =>
  Math.floor((new Date(utc).getTime() + NPT_OFFSET_MS) / 86_400_000);

// Every competition we carry, in display order. `stage` values are written by
// the sync-fixtures edge function.
const COMPETITIONS: { stage: string; label: string; short: string }[] = [
  { stage: "league", label: "Premier League", short: "Premier League" },
  { stage: "community_shield", label: "Community Shield", short: "Community Shield" },
  { stage: "fa_cup", label: "FA Cup", short: "FA Cup" },
];
const LABEL_BY_STAGE = new Map(COMPETITIONS.map((c) => [c.stage, c.label]));

function MatchesPage() {
  const [showPast, setShowPast] = useState(false);
  const [comp, setComp] = useState<string>("all");
  const { data: matches } = useQuery({
    queryKey: ["matches", "all"],
    refetchInterval: 60_000, // live: pull fresh scores/status every 60s
    queryFn: async () => {
      // All competitions — the Premier League, the Community Shield and the FA
      // Cup all live in `matches`, told apart by `stage`.
      const { data } = await supabase
        .from("matches")
        .select("*, team_a:teams!matches_team_a_id_fkey(*), team_b:teams!matches_team_b_id_fkey(*)")
        .order("kickoff_utc");
      return data ?? [];
    },
  });

  // Goal events, fetched separately so the page still works if the table isn't
  // created yet (the query just errors quietly and goals stay empty).
  const { data: events } = useQuery({
    queryKey: ["match-events"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("match_events")
        .select("match_id, team_id, kind, minute, scorer, assist")
        .order("minute", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
    retry: false,
  });
  const eventsByMatch = new Map<string, any[]>();
  for (const e of events ?? []) {
    const arr = eventsByMatch.get(e.match_id) ?? [];
    arr.push(e);
    eventsByMatch.set(e.match_id, arr);
  }

  // Only offer a competition tab once that competition actually has fixtures —
  // the FA Cup rounds involving PL clubs aren't published until the winter.
  const stagesPresent = new Set((matches ?? []).map((m) => m.stage));
  const tabs = COMPETITIONS.filter((c) => stagesPresent.has(c.stage));
  const visible = (matches ?? []).filter((m) => comp === "all" || m.stage === comp);

  // Confirmed matches grouped by NPT day; "Time TBC" fixtures kept separate.
  const confirmed = visible.filter((m) => !m.time_tbc);
  const tbc = visible.filter((m) => m.time_tbc);

  const byDay = new Map<number, any[]>();
  for (const m of confirmed) {
    const idx = nptDayIndex(m.kickoff_utc);
    if (!byDay.has(idx)) byDay.set(idx, []);
    byDay.get(idx)!.push(m);
  }
  const groups = [...byDay.entries()]
    .map(([idx, list]) => ({ idx, list, label: formatNPTDate(list[0].kickoff_utc) }))
    .sort((a, b) => a.idx - b.idx);

  const todayIdx = nptDayIndex(Date.now());
  const today = groups.find((g) => g.idx === todayIdx);
  const upcoming = groups.filter((g) => g.idx > todayIdx);
  const past = groups.filter((g) => g.idx < todayIdx).reverse(); // most-recent day first

  // If there's nothing current to show (a rest day, or after the final), reveal
  // the older matches by default instead of an almost-empty page.
  const hasCurrent = !!today || upcoming.length > 0;
  const pastVisible = !hasCurrent || showPast;

  // The older matches live at the bottom; the top-right toggle reveals them and
  // smooth-scrolls down to that section.
  const olderRef = useRef<HTMLElement>(null);
  const onToggleOlder = () => {
    if (pastVisible) {
      setShowPast(false);
    } else {
      setShowPast(true);
      setTimeout(
        () => olderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        50,
      );
    }
  };

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-4xl font-bold">Match schedule</h2>
          <p className="mt-2 text-muted-foreground">
            Premier League, Community Shield and FA Cup. All kickoff times converted to Nepal
            Standard Time (UTC +5:45).
            {!isTournamentStarted() &&
              " The season has not started yet — no scores will appear until matches kick off."}
          </p>
        </div>
        {past.length > 0 && hasCurrent && (
          <button
            onClick={onToggleOlder}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-bold text-foreground transition hover:border-primary hover:bg-primary/5"
          >
            <ChevronDown className={`size-4 transition ${pastVisible ? "rotate-180" : ""}`} />
            {pastVisible ? "Hide older matches" : "Show older matches & highlights"}
          </button>
        )}
      </header>

      {tabs.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {[{ stage: "all", short: "All competitions" }, ...tabs].map((t) => (
            <button
              key={t.stage}
              onClick={() => setComp(t.stage)}
              className={`rounded-full border px-4 py-1.5 text-sm font-bold transition ${
                comp === t.stage
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-surface text-muted-foreground hover:border-primary hover:text-foreground"
              }`}
            >
              {t.short}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 && (
        <p className="rounded-2xl border border-border bg-surface p-6 text-center text-muted-foreground">
          No fixtures loaded for this competition yet.
        </p>
      )}

      {today && (
        <Section
          title="Today"
          subtitle={today.label}
          list={today.list}
          events={eventsByMatch}
          accent
        />
      )}

      {upcoming.map((g) => (
        <Section key={g.idx} title={g.label} list={g.list} events={eventsByMatch} />
      ))}

      {tbc.length > 0 && (
        <Section
          title="Time TBC"
          subtitle="Fixture confirmed; kickoff time will be published closer to the date."
          list={tbc}
          events={eventsByMatch}
          hideTime
        />
      )}

      {past.length > 0 && (
        <section ref={olderRef} className="scroll-mt-24 space-y-10">
          {pastVisible && (
            <>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-xl font-bold text-muted-foreground">
                  Older matches &amp; highlights
                </h3>
                {hasCurrent && (
                  <button
                    onClick={() => setShowPast(false)}
                    className="text-xs font-bold text-primary hover:underline"
                  >
                    Hide
                  </button>
                )}
              </div>
              {past.map((g) => (
                <Section key={g.idx} title={g.label} list={g.list} events={eventsByMatch} />
              ))}
            </>
          )}
        </section>
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  list,
  events,
  hideTime,
  accent,
}: {
  title: string;
  subtitle?: string;
  list: any[];
  events?: Map<string, any[]>;
  hideTime?: boolean;
  accent?: boolean;
}) {
  return (
    <section>
      <h3
        className={`mb-3 flex flex-wrap items-center gap-2 font-display text-xl font-bold ${
          accent ? "text-primary" : ""
        }`}
      >
        {accent && <span className="size-2 animate-pulse rounded-full bg-primary" />}
        {title}
        {subtitle && (
          <span className="text-sm font-semibold text-muted-foreground">{subtitle}</span>
        )}
      </h3>
      <div className="space-y-2">
        {list.map((m) => (
          <MatchRow key={m.id} m={m} events={events?.get(m.id) ?? []} hideTime={hideTime} />
        ))}
      </div>
    </section>
  );
}

/**
 * Competition line for a match card: "Gameweek 4" for the league, and
 * "FA Cup · Third Round" for cup ties (the round is dropped when it would just
 * repeat the competition name).
 */
function stageLabel(m: any): string {
  if (m.stage === "league") {
    return `Gameweek ${String(m.group_name ?? "").replace(/\D/g, "") || m.group_name}`;
  }
  if (m.stage === "group") return `Group ${m.group_name}`;
  const comp = LABEL_BY_STAGE.get(m.stage) ?? String(m.stage).replace(/_/g, " ").toUpperCase();
  const round = String(m.group_name ?? "").trim();
  return round && round !== comp ? `${comp} · ${round}` : comp;
}

/** A single match as a responsive card: meta + status on top, teams below. */
function MatchRow({ m, events = [], hideTime }: { m: any; events?: any[]; hideTime?: boolean }) {
  const played = m.status === "finished";
  const live = m.status === "live";
  // A score exists as soon as a match is under way; only upcoming games have none.
  const hasScore = (live || played) && m.score_a != null && m.score_b != null;
  // Goals split by side (home = team_a). Own goals count for the OTHER team.
  const goalFor = (teamId: string) =>
    events
      .filter((e) => (e.kind === "own_goal" ? e.team_id !== teamId : e.team_id === teamId))
      .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));
  const homeGoals = m.team_a?.id ? goalFor(m.team_a.id) : [];
  const awayGoals = m.team_b?.id ? goalFor(m.team_b.id) : [];
  const stage = stageLabel(m);
  return (
    <div className="rounded-2xl border border-border bg-surface p-3 shadow-card sm:px-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs font-extrabold uppercase tracking-wide text-foreground">
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
        <Crest src={m.team_a?.flag_emoji} size={28} />
        <span className="min-w-0 flex-1 truncate font-semibold">{m.team_a?.name ?? "TBD"}</span>
        {hasScore ? (
          <span
            className={`shrink-0 rounded px-2 py-0.5 font-mono text-sm font-bold ${
              live ? "bg-magenta/10 text-magenta" : "bg-muted"
            }`}
          >
            {m.score_a}–{m.score_b}
          </span>
        ) : (
          <span className="shrink-0 px-1 text-xs text-muted-foreground">vs</span>
        )}
        <span className="min-w-0 flex-1 truncate text-right font-semibold">
          {m.team_b?.name ?? "TBD"}
        </span>
        <Crest src={m.team_b?.flag_emoji} size={28} />
      </div>

      {events.length > 0 && (
        <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border pt-2 text-[11px]">
          <ul className="space-y-1">
            {homeGoals.map((e) => (
              <GoalLine key={e.id} e={e} align="left" />
            ))}
          </ul>
          <ul className="space-y-1 text-right">
            {awayGoals.map((e) => (
              <GoalLine key={e.id} e={e} align="right" />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** One goal line: ⚽ 34' Scorer (assist: X). */
function GoalLine({ e, align }: { e: any; align: "left" | "right" }) {
  const parts = (
    <>
      <span className="font-semibold text-foreground">{e.scorer}</span>
      {e.kind === "penalty" && <span className="text-muted-foreground"> (pen)</span>}
      {e.kind === "own_goal" && <span className="text-muted-foreground"> (OG)</span>}
      {e.minute != null && <span className="text-muted-foreground"> {e.minute}&apos;</span>}
      {e.assist && (
        <span className="block text-[10px] text-muted-foreground">assist: {e.assist}</span>
      )}
    </>
  );
  return (
    <li className={align === "right" ? "flex flex-col items-end" : ""}>
      <span>
        <span className="text-pitch">⚽</span> {parts}
      </span>
    </li>
  );
}
