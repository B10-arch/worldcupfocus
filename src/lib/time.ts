// Nepal Standard Time = UTC+5:45
const NPT_OFFSET_MIN = 5 * 60 + 45;

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

export function formatNPR(amount: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(amount);
}
