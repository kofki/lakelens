/**
 * UV index from the EPA Envirofacts UV service.
 *
 * The National Weather Service publishes no UV index on any endpoint we call, nor on the
 * raw gridpoint, so UV needs its own provider. EPA Envirofacts is public domain, needs no
 * key, and accepts coordinates directly, so no ZIP lookup is required:
 *
 *   https://data.epa.gov/efservice/getEnvirofactsUVHOURLY/LATITUDE/29.9841/LONGITUDE/-82.7612/JSON
 *
 * Verified 2026-09-20: 21 hourly rows per call, 0.6 to 2.1 s. The DAILY variant accepts
 * coordinates too but answers with UV_INDEX null, so today's index is taken as the peak of
 * the hourly series instead.
 *
 * Times come back as local wall clock with no offset ("Sep/20/2026 07 AM"), which is why
 * this module keeps hours as local hour-of-day rather than pretending to know the zone.
 */

export const EPA_UV_BASE = "https://data.epa.gov/efservice";

/** WHO exposure categories. */
export type UvBand = "low" | "moderate" | "high" | "very-high" | "extreme";

export interface UvHour {
  /** 0-23 local wall clock at the park. */
  hour: number;
  /** YYYY-MM-DD local. */
  date: string;
  value: number;
}

export interface UvPayload {
  source: "epa";
  fetchedAt: string;
  /** Peak UV across the returned day: what "today's UV index" means. */
  peak: number | null;
  /** Local hour the peak occurs, for "strongest around 1 PM". */
  peakHour: number | null;
  /** UV at the local hour nearest now, when the series covers it. */
  now: number | null;
  hours: UvHour[];
  city: string | null;
}

export function buildUvUrl(lat: number, lng: number): string {
  const round = (n: number) => Math.round(n * 1e4) / 1e4;
  return `${EPA_UV_BASE}/getEnvirofactsUVHOURLY/LATITUDE/${round(lat)}/LONGITUDE/${round(lng)}/JSON`;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * "Sep/20/2026 07 AM" -> { date: "2026-09-20", hour: 7 }.
 * Returns null for anything that does not match, so one odd row cannot poison the series.
 */
export function parseEpaDateTime(raw: unknown): { date: string; hour: number } | null {
  const s = String(raw ?? "").trim();
  const m = /^([A-Za-z]{3})\/(\d{1,2})\/(\d{4})\s+(\d{1,2})\s*(AM|PM)$/i.exec(s);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  const day = Number(m[2]);
  const year = Number(m[3]);
  let hour = Number(m[4]);
  const meridiem = m[5].toUpperCase();
  if (!month || !Number.isFinite(day) || !Number.isFinite(year) || !Number.isFinite(hour)) return null;
  if (hour === 12) hour = 0;
  if (meridiem === "PM") hour += 12;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${year}-${pad(month)}-${pad(day)}`, hour };
}

interface EpaUvRow {
  ORDER?: number;
  CITY?: string | null;
  DATE_TIME?: string;
  UV_VALUE?: number | string | null;
}

/** Raw EPA rows -> a sorted, de-duplicated hourly series. */
export function parseUvHourly(json: unknown): UvHour[] {
  if (!Array.isArray(json)) return [];
  const byKey = new Map<string, UvHour>();
  for (const row of json as EpaUvRow[]) {
    const when = parseEpaDateTime(row?.DATE_TIME);
    if (!when) continue;
    const value = typeof row.UV_VALUE === "number" ? row.UV_VALUE : Number.parseFloat(String(row.UV_VALUE ?? ""));
    if (!Number.isFinite(value) || value < 0) continue;
    byKey.set(`${when.date}T${when.hour}`, { hour: when.hour, date: when.date, value });
  }
  return [...byKey.values()].sort((a, b) => (a.date === b.date ? a.hour - b.hour : a.date < b.date ? -1 : 1));
}

/** WHO band for a UV index. */
export function uvBand(uv: number): UvBand {
  if (uv < 3) return "low";
  if (uv < 6) return "moderate";
  if (uv < 8) return "high";
  if (uv < 11) return "very-high";
  return "extreme";
}

export interface FetchUvOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Local hour at the park, used to pick the "now" value. */
  localHour?: number;
  now?: Date;
}

export function buildUvPayload(rows: UvHour[], opts: FetchUvOptions = {}, city: string | null = null): UvPayload {
  const fetchedAt = (opts.now ?? new Date()).toISOString();
  if (rows.length === 0) {
    return { source: "epa", fetchedAt, peak: null, peakHour: null, now: null, hours: [], city };
  }
  let best = rows[0];
  for (const r of rows) if (r.value > best.value) best = r;
  const hour = opts.localHour;
  const atNow = typeof hour === "number" ? rows.find((r) => r.hour === hour) : undefined;
  return {
    source: "epa",
    fetchedAt,
    peak: best.value,
    peakHour: best.hour,
    now: atNow ? atNow.value : null,
    hours: rows,
    city,
  };
}

/** One EPA call for one park. Throws on transport failure; the caller decides how to degrade. */
export async function fetchUvForPark(lat: number, lng: number, opts: FetchUvOptions = {}): Promise<UvPayload> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(buildUvUrl(lat, lng), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
  });
  if (!res.ok) throw new Error(`EPA UV HTTP ${res.status}`);
  const json = (await res.json()) as unknown;
  const city = Array.isArray(json) && json.length > 0 ? ((json[0] as EpaUvRow).CITY ?? null) : null;
  return buildUvPayload(parseUvHourly(json), opts, city);
}
