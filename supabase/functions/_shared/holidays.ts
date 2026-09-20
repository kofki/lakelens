/**
 * Nager.Date v3 (public domain, no auth, cache-control 7 d).
 *
 * - GET https://date.nager.at/api/v3/PublicHolidays/{year}/US
 *     keep rows with global === true AND types includes "Public" (the 11 federal holidays,
 *     observed dates), deduped by date. State-scoped rows (Good Friday, Truman Day, ...) are dropped.
 * - GET https://date.nager.at/api/v3/LongWeekend/{year}/US -> { start_date, end_date }
 *
 * Runtime-neutral; injectable fetchImpl for tests.
 */
import type { Holiday, LongWeekend } from "./types.ts";

export const NAGER_BASE = "https://date.nager.at/api/v3";

export interface NagerHoliday {
  date: string; // YYYY-MM-DD
  localName: string;
  name: string;
  countryCode: string;
  fixed?: boolean;
  global: boolean;
  counties?: string[] | null;
  launchYear?: number | null;
  types: string[];
}

export interface NagerLongWeekend {
  startDate: string;
  endDate: string;
  dayCount?: number;
  needBridgeDay?: boolean;
  bridgeDays?: string[];
}

export interface HolidayFetchOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Filter + dedupe Nager rows into the app's Holiday shape (observed federal dates). */
export function normalizeNagerHolidays(rows: NagerHoliday[]): Holiday[] {
  const byDate = new Map<string, Holiday>();
  for (const r of rows ?? []) {
    if (!r || r.global !== true || !Array.isArray(r.types) || !r.types.includes("Public")) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) continue;
    if (!byDate.has(r.date)) byDate.set(r.date, { date: r.date, name: r.localName || r.name });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function normalizeLongWeekends(rows: NagerLongWeekend[]): LongWeekend[] {
  const seen = new Set<string>();
  const out: LongWeekend[] = [];
  for (const r of rows ?? []) {
    if (!r?.startDate || !r?.endDate || seen.has(r.startDate)) continue;
    seen.add(r.startDate);
    out.push({ start_date: r.startDate, end_date: r.endDate });
  }
  return out.sort((a, b) => a.start_date.localeCompare(b.start_date));
}

async function getJson<T>(url: string, opts: HolidayFetchOptions): Promise<T> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 10000),
  });
  if (!res.ok) throw new Error(`Nager.Date HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

export async function fetchNagerHolidays(year: number, opts: HolidayFetchOptions = {}): Promise<Holiday[]> {
  const rows = await getJson<NagerHoliday[]>(`${NAGER_BASE}/PublicHolidays/${year}/US`, opts);
  return normalizeNagerHolidays(rows);
}

export async function fetchLongWeekends(year: number, opts: HolidayFetchOptions = {}): Promise<LongWeekend[]> {
  const rows = await getJson<NagerLongWeekend[]>(`${NAGER_BASE}/LongWeekend/${year}/US`, opts);
  return normalizeLongWeekends(rows);
}
