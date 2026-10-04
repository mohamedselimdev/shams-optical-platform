/**
 * Business-day helpers in Africa/Cairo. Egypt observes daylight saving time (UTC+2 / UTC+3), so
 * offsets are derived from the IANA zone rather than hard-coded.
 */
const TZ = "Africa/Cairo";

/** YYYY-MM-DD of the given instant in Cairo. */
export function cairoDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Cairo UTC offset in minutes at the given instant. */
function offsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** The instant a Cairo calendar day (YYYY-MM-DD) starts. */
export function cairoDayStart(day: string): Date {
  const guess = new Date(`${day}T00:00:00Z`);
  const first = new Date(guess.getTime() - offsetMinutes(guess) * 60_000);
  return new Date(guess.getTime() - offsetMinutes(first) * 60_000);
}

/** The last millisecond of a Cairo calendar day. */
export function cairoDayEnd(day: string): Date {
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return new Date(cairoDayStart(next.toISOString().slice(0, 10)).getTime() - 1);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
