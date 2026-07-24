// Nepal Standard Time = UTC+5:45
const NPT_OFFSET_MIN = 5 * 60 + 45;

// Season anchors (UTC). NPT = UTC + 5:45.
// Premier League 2026/27 opens: Arsenal v Coventry — Sat Aug 22, 00:45 NPT
// == 2026-08-21 19:00 UTC (the season's first kickoff).
export const TOURNAMENT_START_UTC = new Date("2026-08-21T19:00:00Z");
// Pick lock: club selection closes at the first kickoff (2026-08-21 19:00 UTC).
// Keep in sync with the DB trigger enforce_bet_lock (updated for the new season).
export const BET_LOCK_UTC = new Date("2026-08-21T19:00:00Z");

export function isBetLocked(now: Date = new Date()): boolean {
  return now.getTime() >= BET_LOCK_UTC.getTime();
}

export function isTournamentStarted(now: Date = new Date()): boolean {
  return now.getTime() >= TOURNAMENT_START_UTC.getTime();
}

export function toNPT(date: Date | string): Date {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Date(d.getTime() + NPT_OFFSET_MIN * 60 * 1000);
}

export function formatNPT(date: Date | string, opts: Intl.DateTimeFormatOptions = {}): string {
  const npt = toNPT(date);
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
    ...opts,
  }).format(npt);
}

export function formatNPTDate(date: Date | string): string {
  const npt = toNPT(date);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(npt);
}

export function formatNPTFull(date: Date | string): string {
  return `${formatNPTDate(date)} — ${formatNPT(date)} NPT`;
}

export function formatNPR(amount: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(amount);
}
