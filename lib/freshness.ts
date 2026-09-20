/**
 * lib/freshness.ts: staleness thresholds, relative-time labels and the
 * America/New_York time-zone helpers used by every other logic module.
 * Pure TS: no React / Next / DOM and no date libraries: Intl.DateTimeFormat only.
 */

export const DEFAULT_TZ = "America/New_York";

/** Max age (ms) before a data source is shown as stale. */
export const STALE = {
  usgs: 6 * 3600e3,
  weather: 3 * 3600e3,
  alerts: 12 * 3600e3,
  reports: 2 * 3600e3,
} as const;

const MINUTE = 60e3;
const HOUR = 3600e3;
const DAY = 86400e3;

/** Wall-clock parts of an instant in a given IANA time zone. */
export interface LocalParts {
  year: number;
  /** 1 to 12 */
  month: number;
  /** 1 to 31 */
  day: number;
  /** 0 to 23 */
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  /** "YYYY-MM-DD" */
  date: string;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    partsFormatters.set(tz, f);
  }
  return f;
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Break an instant into local wall-clock parts for `tz` (default America/New_York). */
export function localParts(date: Date, tz: string = DEFAULT_TZ): LocalParts {
  const out: Record<string, string> = {};
  for (const p of partsFormatter(tz).formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = p.value;
  }
  const year = Number(out.year);
  const month = Number(out.month);
  const day = Number(out.day);
  const hour = Number(out.hour) % 24;
  const minute = Number(out.minute);
  const second = Number(out.second);
  const weekday = WEEKDAY_INDEX[out.weekday ?? ""] ?? new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    weekday,
    date: `${year}-${pad2(month)}-${pad2(day)}`,
  };
}

/** "YYYY-MM-DD" of an instant in `tz`. */
export function localDateKey(date: Date, tz: string = DEFAULT_TZ): string {
  return localParts(date, tz).date;
}

/** Offset (ms) of `tz` from UTC at the given instant: local wall clock − UTC. */
export function tzOffsetMs(date: Date, tz: string = DEFAULT_TZ): number {
  const p = localParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const truncated = Math.floor(date.getTime() / 1000) * 1000;
  return asUtc - truncated;
}

/**
 * Convert a local wall-clock time ("YYYY-MM-DD" + hh:mm in `tz`) to the UTC instant.
 * Two-pass offset lookup handles DST transitions well enough for our purposes.
 */
export function zonedTimeToUtc(dateKey: string, hour: number, minute: number, tz: string = DEFAULT_TZ): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute, 0, 0);
  const off1 = tzOffsetMs(new Date(guess), tz);
  let utc = guess - off1;
  const off2 = tzOffsetMs(new Date(utc), tz);
  if (off2 !== off1) utc = guess - off2;
  return new Date(utc);
}

/** Parse an ISO string defensively; returns null for null/empty/invalid input. */
export function parseIso(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t);
}

/** True when the timestamp is missing, unparseable, or older than `maxAgeMs` at `now`. */
export function isStale(iso: string | null, maxAgeMs: number, now: Date): boolean {
  const d = parseIso(iso);
  if (!d) return true;
  return now.getTime() - d.getTime() > maxAgeMs;
}

/**
 * Plain-language relative time: "just now", "25 min ago", "1 hour ago", "3 hours ago",
 * "2 days ago"; "unknown" for missing/invalid input. Future timestamps read "in 5 min".
 */
export function relativeTime(iso: string | null, now: Date): string {
  const d = parseIso(iso);
  if (!d) return "unknown";
  const diff = now.getTime() - d.getTime();
  const abs = Math.abs(diff);
  if (abs < 45e3) return "just now";
  const future = diff < 0;
  let label: string;
  if (abs < HOUR) {
    const m = Math.max(1, Math.round(abs / MINUTE));
    label = `${m} min`;
  } else if (abs < DAY) {
    const h = Math.round(abs / HOUR);
    label = `${h} ${h === 1 ? "hour" : "hours"}`;
  } else {
    const days = Math.round(abs / DAY);
    label = `${days} ${days === 1 ? "day" : "days"}`;
  }
  return future ? `in ${label}` : `${label} ago`;
}

/** Replace the narrow no-break spaces newer ICU builds insert before AM/PM. */
function normalizeSpaces(s: string): string {
  return s.replace(/[  ]/g, " ");
}

const timeFormatters = new Map<string, Intl.DateTimeFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

/** "10:15 AM" in `tz` (default America/New_York). Returns "" for invalid input. */
export function formatLocalTime(iso: string, tz: string = DEFAULT_TZ): string {
  const d = parseIso(iso);
  if (!d) return "";
  let f = timeFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
    timeFormatters.set(tz, f);
  }
  return normalizeSpaces(f.format(d));
}

/** "Sat, Sep 19" in `tz` (default America/New_York). Returns "" for invalid input. */
export function formatLocalDate(iso: string, tz: string = DEFAULT_TZ): string {
  const d = parseIso(iso);
  if (!d) return "";
  let f = dateFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
    dateFormatters.set(tz, f);
  }
  return normalizeSpaces(f.format(d));
}

/** "10:15 AM" for a local hh:mm on a given local date (used for predicted fill times). */
export function formatClock(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? "AM" : "PM";
  return `${h12}:${pad2(minute)} ${ampm}`;
}
