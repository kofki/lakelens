/**
 * Fetch US federal public holidays + long weekends for 2026 and 2027 from Nager.Date
 * and write data/holidays-2026-2027.json in the shape { holidays: Holiday[], long_weekends: LongWeekend[] }.
 *
 *   node --experimental-strip-types scripts/fetch-holidays.ts [--refresh]
 *
 * Filtering (verified against the live API 2026-09-19): Nager returns ~17 rows/year including
 * state-scoped rows (Lincoln's Birthday, Good Friday, Truman Day, Columbus/Indigenous Peoples' Day).
 * We keep only rows with global === true AND types including "Public", deduped by date
 * (first row wins). Dates are the OBSERVED federal dates (e.g. Independence Day 2026 = 07-03).
 * Raw responses are cached under data/osm-cache/nager-*.json so the script is idempotent/offline.
 */
import { join } from "node:path";
import type { Holiday, LongWeekend } from "../lib/types";
// Node's type-stripping needs the explicit .ts extension at runtime, but the root tsconfig (INFRA-owned)
// has no allowImportingTsExtensions, so a computed specifier keeps both tsc and `node` happy.
const { DATA_DIR, cachedFetchJson, log, writeJson }: typeof import("./fetch-lib") = await import("./fetch-lib" + ".ts");

interface NagerHoliday {
  date: string;
  localName: string;
  name: string;
  countryCode: string;
  fixed: boolean;
  global: boolean;
  counties: string[] | null;
  launchYear: number | null;
  types: string[];
}

interface NagerLongWeekend {
  startDate: string;
  endDate: string;
  dayCount: number;
  needBridgeDay: boolean;
  bridgeDays: string[];
}

export const YEARS = [2026, 2027] as const;
const COUNTRY = "US";
const OUT_PATH = join(DATA_DIR, "holidays-2026-2027.json");

/** Pure: keep global public holidays, dedupe by date (first wins), sort by date. */
export function filterPublicHolidays(rows: NagerHoliday[]): Holiday[] {
  const seen = new Set<string>();
  const out: Holiday[] = [];
  for (const row of rows) {
    if (!row.global) continue;
    if (!Array.isArray(row.types) || !row.types.includes("Public")) continue;
    if (seen.has(row.date)) continue;
    seen.add(row.date);
    // Nager's English `name` uses British spelling ("Labour Day"); prefer US spelling for plain language.
    const name = row.name === "Labour Day" ? "Labor Day" : row.name;
    out.push({ date: row.date, name });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function mapLongWeekends(rows: NagerLongWeekend[]): LongWeekend[] {
  const seen = new Set<string>();
  const out: LongWeekend[] = [];
  for (const row of rows) {
    if (seen.has(row.startDate)) continue;
    seen.add(row.startDate);
    out.push({ start_date: row.startDate, end_date: row.endDate });
  }
  return out.sort((a, b) => a.start_date.localeCompare(b.start_date));
}

async function main(): Promise<void> {
  const holidays: Holiday[] = [];
  const longWeekends: LongWeekend[] = [];
  const sources: string[] = [];

  for (const year of YEARS) {
    const holidayUrl = `https://date.nager.at/api/v3/PublicHolidays/${year}/${COUNTRY}`;
    const lwUrl = `https://date.nager.at/api/v3/LongWeekend/${year}/${COUNTRY}`;

    const h = await cachedFetchJson<NagerHoliday[]>(`nager-public-holidays-${year}.json`, holidayUrl);
    log(`PublicHolidays ${year}: ${h.data.length} raw rows (${h.fromCache ? "cache" : "network"})`);
    holidays.push(...filterPublicHolidays(h.data));

    const lw = await cachedFetchJson<NagerLongWeekend[]>(`nager-long-weekends-${year}.json`, lwUrl);
    log(`LongWeekend ${year}: ${lw.data.length} raw rows (${lw.fromCache ? "cache" : "network"})`);
    longWeekends.push(...mapLongWeekends(lw.data));

    sources.push(holidayUrl, lwUrl);
  }

  // Dedupe across years (defensive) and sort.
  const byDate = new Map<string, Holiday>();
  for (const h of holidays) if (!byDate.has(h.date)) byDate.set(h.date, h);
  const finalHolidays = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  const byStart = new Map<string, LongWeekend>();
  for (const w of longWeekends) if (!byStart.has(w.start_date)) byStart.set(w.start_date, w);
  const finalLongWeekends = [...byStart.values()].sort((a, b) => a.start_date.localeCompare(b.start_date));

  const out = {
    meta: {
      source: "Nager.Date v3 (https://date.nager.at), public domain",
      filter: "global === true && types includes 'Public'; deduped by date; observed federal dates",
      fetched_at: new Date().toISOString(),
      sources,
    },
    holidays: finalHolidays,
    long_weekends: finalLongWeekends,
  };
  writeJson(OUT_PATH, out);
  log(`wrote ${OUT_PATH}: ${finalHolidays.length} holidays, ${finalLongWeekends.length} long weekends`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
