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

function MatchesPage() {
  const [showPast, setShowPast] = useState(false);
  const { data: matches } = useQuery({
    queryKey: ["matches", "all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("matches")
        .select("*, team_a:teams!matches_team_a_id_fkey(*), team_b:teams!matches_team_b_id_fkey(*)")
        .eq("stage", "league") // Premier League fixtures only
        .order("kickoff_utc");
      return data ?? [];
    },
  });

  // Confirmed matches grouped by NPT day; "Time TBC" fixtures kept separate.
  const confirmed = (matches ?? []).filter((m) => !m.time_tbc);
  const tbc = (matches ?? []).filter((m) => m.time_tbc);

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
            All kickoff times converted to Nepal Standard Time (UTC +5:45).
            {!isTournamentStarted() &&
              " The tournament has not started yet — no scores will appear until matches kick off."}
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

      {today && <Section title="Today" subtitle={today.label} list={today.list} accent />}

      {upcoming.map((g) => (
        <Section key={g.idx} title={g.label} list={g.list} />
      ))}

      {tbc.length > 0 && (
        <Section
          title="Time TBC"
          subtitle="Fixture confirmed; kickoff time will be published closer to the date."
          list={tbc}
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
                <Section key={g.idx} title={g.label} list={g.list} />
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
  hideTime,
  accent,
}: {
  title: string;
  subtitle?: string;
  list: any[];
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
          <MatchRow key={m.id} m={m} hideTime={hideTime} />
        ))}
      </div>
    </section>
  );
}

/** A single match as a responsive card: meta + status on top, teams below. */
function MatchRow({ m, hideTime }: { m: any; hideTime?: boolean }) {
  const played = m.status === "finished";
  const stage =
    m.stage === "league"
      ? `Gameweek ${String(m.group_name ?? "").replace(/\D/g, "") || m.group_name}`
      : m.stage === "group"
        ? `Group ${m.group_name}`
        : String(m.stage).toUpperCase();
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
        <Crest src={m.team_b?.flag_emoji} size={28} />
      </div>
    </div>
  );
}
