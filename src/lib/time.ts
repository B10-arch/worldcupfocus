// Nepal Standard Time = UTC+5:45
const NPT_OFFSET_MIN = 5 * 60 + 45;

// Tournament anchors (UTC). NPT = UTC + 5:45.
// Opening match: Mexico vs South Africa — Fri Jun 12, 00:45 NPT == 2026-06-11 19:00 UTC
export const TOURNAMENT_START_UTC = new Date("2026-06-11T19:00:00Z");
// Bet lock: picks close at 11:59 AM NPT on Jun 11 == 06:14 UTC on Jun 11.
// (Keep in sync with the DB trigger in 20260611190000_bet_lock.sql.)
export const BET_LOCK_UTC = new Date("2026-06-11T06:14:00Z");

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
