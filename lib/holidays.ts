/**
 * lib/holidays.ts: turns an instant into a DayContext (local date, weekend, holiday,
 * long weekend, calendar events) using America/New_York wall-clock time.
 * Pure TS: no React / Next / DOM, no date libraries.
 */
import type { CalendarEvent, DayContext, Holiday, LongWeekend } from "./types";
import { DEFAULT_TZ, localParts, pad2 } from "./freshness";

const DAY_MS = 86400e3;

function keyToUtc(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Add whole days to a "YYYY-MM-DD" key (calendar arithmetic, no time zone involved). */
export function shiftDateKey(key: string, days: number): string {
  const t = new Date(keyToUtc(key) + days * DAY_MS);
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

/** 0 = Sunday … 6 = Saturday for a "YYYY-MM-DD" key. */
export function weekdayOfKey(key: string): number {
  return new Date(keyToUtc(key)).getUTCDay();
}

export function isValidDateKey(key: string | null | undefined): key is string {
  return typeof key === "string" && /^\d{4}-\d{2}-\d{2}$/.test(key) && !Number.isNaN(keyToUtc(key));
}

/**
 * The long-weekend window a holiday implies from its weekday
 * (Mon → Sat..Mon, Fri → Fri..Sun, Thu → Thu..Sun, Tue → Sat..Tue, Sat/Sun → that weekend).
 * Used when the caller has no explicit LongWeekend list (e.g. Nager fetch failed).
 */
export function holidayWindow(h: Holiday): { start: string; end: string } | null {
  if (!isValidDateKey(h.date)) return null;
  switch (weekdayOfKey(h.date)) {
    case 1:
      return { start: shiftDateKey(h.date, -2), end: h.date };
    case 5:
      return { start: h.date, end: shiftDateKey(h.date, 2) };
    case 4:
      return { start: h.date, end: shiftDateKey(h.date, 3) };
    case 2:
      return { start: shiftDateKey(h.date, -3), end: h.date };
    case 6:
      return { start: h.date, end: shiftDateKey(h.date, 1) };
    case 0:
      return { start: shiftDateKey(h.date, -1), end: h.date };
    default:
      return null;
  }
}

function inRange(date: string, start: string, end: string): boolean {
  return start <= date && date <= end;
}

/**
 * Build the DayContext for `date` as seen from `tz` (default America/New_York).
 * - isWeekend: Saturday or Sunday (local).
 * - isHoliday / holidayName: a Holiday whose observed date equals the local date.
 * - isHolidayWeekend: date falls inside an explicit LongWeekend range, or inside the
 *   window implied by a holiday's weekday (so "Sat before Labor Day" counts even when
 *   the long-weekend feed is missing). holidayName is filled from that holiday too.
 * - events / eventWeight: CalendarEvents whose inclusive [start, end] contains the date;
 *   weight defaults to 1 per event.
 */
export function getDayContext(
  date: Date,
  holidays: Holiday[],
  longWeekends: LongWeekend[],
  events: CalendarEvent[],
  tz: string = DEFAULT_TZ,
): DayContext {
  const parts = localParts(date, tz);
  const key = parts.date;
  const isWeekend = parts.weekday === 0 || parts.weekday === 6;

  const todayHoliday = (holidays ?? []).find((h) => h.date === key) ?? null;
  const isHoliday = todayHoliday !== null;

  let holidayName: string | null = todayHoliday?.name ?? null;
  let isHolidayWeekend = false;

  const explicit = (longWeekends ?? []).find((lw) => inRange(key, lw.start_date, lw.end_date));
  if (explicit) {
    isHolidayWeekend = true;
    if (!holidayName) {
      const within = (holidays ?? []).find((h) => inRange(h.date, explicit.start_date, explicit.end_date));
      holidayName = within?.name ?? null;
    }
  }

  if (!isHolidayWeekend || !holidayName) {
    for (const h of holidays ?? []) {
      const w = holidayWindow(h);
      if (w && inRange(key, w.start, w.end)) {
        isHolidayWeekend = true;
        if (!holidayName) holidayName = h.name;
        break;
      }
    }
  }

  const active = (events ?? []).filter((e) => isValidDateKey(e.start) && isValidDateKey(e.end) && inRange(key, e.start, e.end));
  const eventWeight = active.reduce((sum, e) => sum + (typeof e.weight === "number" && Number.isFinite(e.weight) ? e.weight : 1), 0);

  return {
    date: key,
    isWeekend,
    isHoliday,
    holidayName,
    isHolidayWeekend,
    events: active.map((e) => e.name),
    eventWeight,
  };
}
