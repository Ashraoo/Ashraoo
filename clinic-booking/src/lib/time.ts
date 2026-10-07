/** Date helpers. Calendar dates are plain "YYYY-MM-DD" strings in the clinic's timezone. */

/** Arabic text with Latin digits, matching how phone numbers and prices are typed in Egypt. */
const LOCALE = "ar-EG-u-nu-latn";

export const WEEKDAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

/** Today's date in a timezone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return dateIn(now, timeZone);
}

/** The calendar date of an instant, in a timezone. */
export function dateIn(instant: Date | string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function offsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** Converts a wall-clock date + time ("HH:MM") in `timeZone` to a UTC instant. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let guess = wall - offsetMs(wall, timeZone);
  // second pass handles DST transitions
  guess = wall - offsetMs(guess, timeZone);
  return new Date(guess);
}

export function formatTime(instant: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(instant));
}

export function formatDateLong(instant: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(instant));
}

/** Formats a calendar date string (no timezone shift). */
export function formatDay(date: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) {
  return new Intl.DateTimeFormat(LOCALE, { ...opts, timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

export function formatMoney(amount: number | string): string {
  const n = Number(amount);
  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 }).format(n)} ج.م`;
}

/** "HH:MM:SS" -> "HH:MM" */
export function trimSeconds(t: string): string {
  return t.slice(0, 5);
}

/** PostgREST returns setof-scalar functions as an array of values (or rows keyed by function name). */
export function scalarRows<T>(data: unknown, fn: string): T[] {
  if (!Array.isArray(data)) return [];
  return data.map((row) =>
    row !== null && typeof row === "object" && fn in (row as Record<string, unknown>)
      ? ((row as Record<string, unknown>)[fn] as T)
      : (row as T),
  );
}
