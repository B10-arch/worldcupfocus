import type { TeamLineup } from "@/lib/live-lineups";

/** One team's lineup — fits a narrow column flanking the Watch player. */
export function LineupPanel({
  team,
  clock,
  className = "",
}: {
  team: TeamLineup;
  clock?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-border bg-surface p-3 shadow-card ${className}`}>
      <div className="mb-2 flex items-center gap-2 border-b border-border pb-2">
        {team.logo && <img src={team.logo} alt="" className="size-6 shrink-0 object-contain" />}
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight">{team.name}</p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {team.formation || "Starting XI"}
          </p>
        </div>
        <span className="ml-auto font-display text-xl font-bold">{team.score}</span>
      </div>
      <ul className="space-y-0.5">
        {team.starters.map((p, i) => (
          <li
            key={i}
            className={`flex items-center gap-1.5 text-xs ${
              p.subbedOut ? "text-muted-foreground line-through" : ""
            }`}
          >
            <span className="w-5 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
              {p.jersey}
            </span>
            <span className="truncate">{p.name}</span>
            {p.goals > 0 && <span className="shrink-0">{"⚽".repeat(Math.min(p.goals, 3))}</span>}
            {p.subbedOut && <span className="ml-auto shrink-0 text-[10px] text-magenta">↓</span>}
          </li>
        ))}
      </ul>
      {team.subs.length > 0 && (
        <div className="mt-2 border-t border-border pt-2">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Subs on
          </p>
          <ul className="space-y-0.5">
            {team.subs.map((p, i) => (
              <li key={i} className="flex items-center gap-1.5 text-xs text-pitch">
                <span className="w-5 shrink-0 text-right font-mono text-[10px]">{p.jersey}</span>
                <span className="truncate">{p.name}</span>
                {p.goals > 0 && (
                  <span className="shrink-0">{"⚽".repeat(Math.min(p.goals, 3))}</span>
                )}
                <span className="ml-auto shrink-0 text-[10px]">↑</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {clock && (
        <p className="mt-2 text-center text-[10px] font-bold uppercase tracking-widest text-magenta">
          ● Live {clock}
        </p>
      )}
    </div>
  );
}
