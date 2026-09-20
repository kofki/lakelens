/**
 * Beach water quality (enterococcus) from the Florida Department of Health's
 * "Healthy Beaches" programme.
 *
 * FDOH publishes no API. The data is a Caspio datapage served as HTML, keyed by county,
 * which is why this is a parser rather than a client. The selectors below are load-bearing
 * and each one earned its comment; do not "tidy" them without re-running the probe.
 *
 * Coverage: 34 coastal counties, up to 50 records each (5 pages of 10; the page-size
 * parameter is ignored and page 6 repeats page 5, so the loop is bounded, never
 * "until empty").
 *
 * Thresholds are FDOH's own: 35.4 cfu/100mL and 70.4 cfu/100mL.
 */
import { haversineKm } from "./gauges.ts";

export const CASPIO_BASE = "https://b3.caspio.com/dp/cb8a100003f7272d1f294c7b8cc9";
export const FDOH_SOURCE = "https://www.floridahealth.gov/environmental-health/beach-water-quality/";

/**
 * Legacy spellings the datapage requires: "Dade", not "Miami-Dade"; "St Johns" with no
 * period. Jefferson and Washington return zero records and are omitted.
 */
export const FDOH_COUNTIES = [
  "Bay", "Brevard", "Broward", "Charlotte", "Citrus", "Collier", "Dade", "Dixie", "Duval",
  "Escambia", "Flagler", "Franklin", "Gulf", "Hernando", "Hillsborough", "Indian River",
  "Lee", "Levy", "Manatee", "Martin", "Monroe", "Nassau", "Okaloosa", "Palm Beach", "Pasco",
  "Pinellas", "St Johns", "St Lucie", "Santa Rosa", "Sarasota", "Taylor", "Volusia",
  "Wakulla", "Walton",
] as const;

const MAX_PAGES = 5;
const PAGE_SIZE = 10;
const GOOD_MAX_CFU = 35.4;
const MODERATE_MAX_CFU = 70.4;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;
const FL_BBOX = { minLat: 24.3, maxLat: 31.2, minLon: -87.8, maxLon: -79.7 };

/** A site this far from the park still describes its water; beyond it, we say nothing. */
export const FDOH_MATCH_KM = 15;
/** Two missed 8-to-13 day sampling cycles. Older than this is not "current". */
export const FDOH_MAX_AGE_DAYS = 30;

export type BeachWaterLevel = "good" | "caution" | "advisory";

export interface WqSample {
  /** The datapage leaves the station number empty, so county plus name is the identity. */
  stationId: string;
  stationName: string;
  county: string;
  lat: number;
  lng: number;
  date: string;
  period: string;
  valueCfu: number;
  advisory: boolean;
  level: BeachWaterLevel;
}

export interface BeachWaterQuality {
  level: BeachWaterLevel;
  label: string;
  valueCfu: number;
  station: string;
  county: string;
  sampledAt: string;
  distanceKm: number;
  advisory: boolean;
}

export interface WqHarvest {
  samples: WqSample[];
  failedCounties: string[];
  pagesFetched: number;
  rowsParsed: number;
}

// ---------- parsing ----------

const ROW_DELIM = '<tr class="cbResultSetDataRow';

/**
 * The `</span>` in each pattern is load-bearing: every row also carries a hidden address
 * block repeating "Period:", "Date:" and "Advisory:" WITHOUT the closing span, and matching
 * those gives the wrong value.
 */
const RE_PERIOD = />Period:<\/span>\s*([^<]*)/;
const RE_LOCATION = />Location:<\/span>\s*([^<]*)/;
const RE_DATE = />Date:<\/span>\s*(\d{1,2}\/\d{1,2}\/\d{4})/;
const RE_ADVISORY = />Advisory:<\/span>(?:\s*<[^>]*>)*\s*(Yes|No)/i;
/**
 * The rating is never in the markup: Caspio computes it in the browser from this variable.
 * Never text-match "Good" or "Poor", because a commented-out geometric-mean block and a
 * help tooltip both contain those words.
 */
const RE_ENT = /var\s+enterococcus\s*=\s*'([^']*)'/;
/** Coordinate divs appear twice per row (once commented out) with identical values. */
const RE_LAT = /<div id="Latitude:[^"]*"[^>]*>\s*(-?\d+(?:\.\d+)?)\s*<\/div>/;
const RE_LON = /<div id="Longitude:[^"]*"[^>]*>\s*(-?\d+(?:\.\d+)?)\s*<\/div>/;

/**
 * V8 keeps a sliced string alive by pinning its parent, so any substring of a 457 kB page
 * retains the whole page. Forcing a flat copy is what keeps a 34-county sweep inside the
 * worker's memory budget.
 */
function flatten(s: string): string {
  return s.length < 13 ? s : s.split("").join("");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function toIsoDate(mdy: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(mdy.trim());
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

export function levelFromCfu(cfu: number): BeachWaterLevel {
  if (cfu <= GOOD_MAX_CFU) return "good";
  if (cfu <= MODERATE_MAX_CFU) return "caution";
  return "advisory";
}

export const BEACH_WATER_LABEL: Record<BeachWaterLevel, string> = {
  good: "Good",
  caution: "Caution",
  advisory: "Advisory",
};

export function parseRow(row: string, county: string): WqSample | null {
  const entMatch = RE_ENT.exec(row);
  const rawEnt = entMatch ? entMatch[1].trim() : "";
  // "No Result" rows are dropped here so the previous period's real reading survives.
  if (!rawEnt) return null;
  const cfu = Number(rawEnt);
  if (!Number.isFinite(cfu)) return null;

  const dateMatch = RE_DATE.exec(row);
  const date = dateMatch ? toIsoDate(dateMatch[1]) : null;
  if (!date) return null;

  const latMatch = RE_LAT.exec(row);
  const lonMatch = RE_LON.exec(row);
  if (!latMatch || !lonMatch) return null;
  const lat = Number(latMatch[1]);
  const lng = Number(lonMatch[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < FL_BBOX.minLat || lat > FL_BBOX.maxLat || lng < FL_BBOX.minLon || lng > FL_BBOX.maxLon) return null;

  const locMatch = RE_LOCATION.exec(row);
  const stationName = flatten(decodeEntities(locMatch ? locMatch[1] : ""));
  if (!stationName) return null;

  const periodMatch = RE_PERIOD.exec(row);
  const period = flatten(decodeEntities(periodMatch ? periodMatch[1] : ""));

  const advMatch = RE_ADVISORY.exec(row);
  const fdohSaysYes = !!advMatch && advMatch[1].toLowerCase() === "yes";
  const level = levelFromCfu(cfu);

  /**
   * FDOH's "Advisory" column is the posted state of the beach, not this sample's verdict,
   * and the two disagree on a few percent of records (a 521 cfu reading with Advisory=No).
   * Taking the union means an "advisory" level always implies an advisory, which is the
   * direction that fails safe.
   */
  const advisory = fdohSaysYes || level === "advisory";

  return {
    stationId: flatten(`${county}|${stationName}`),
    stationName,
    county,
    lat,
    lng,
    date,
    period,
    valueCfu: cfu,
    advisory,
    level,
  };
}

/** Parse one county page into `sink`, keeping the newest sample per site. */
export function parseResultSet(html: string, county: string, sink: Map<string, WqSample>): number {
  const first = html.indexOf(ROW_DELIM);
  if (first === -1) return 0;

  /**
   * Rows are about 15 % of the page; the rest is Caspio framework JavaScript after the
   * closing table tag. This slice is what keeps a full sweep inside the CPU budget.
   */
  const closing = html.indexOf("</table>", first);
  const table = html.slice(first, closing === -1 ? html.length : closing);

  let rows = 0;
  let idx = 0;
  while (idx !== -1) {
    const next = table.indexOf(ROW_DELIM, idx + ROW_DELIM.length);
    const row = table.slice(idx, next === -1 ? table.length : next);
    rows++;
    const sample = parseRow(row, county);
    if (sample) {
      const prev = sink.get(sample.stationId);
      /**
       * Newest by DATE, not by period. FDOH issues clearing resamples inside a single
       * period (240 cfu on the 20th, then 4 cfu on the 22nd), so keying on period would
       * leave a cleared beach flagged.
       */
      const newer =
        !prev || sample.date > prev.date || (sample.date === prev.date && Number(sample.period) > Number(prev.period));
      if (newer) sink.set(sample.stationId, sample);
    }
    idx = next;
  }
  return rows;
}

export function extractAppSession(html: string): string | null {
  const m = /appSession=([A-Z0-9]{40,})/.exec(html);
  return m ? flatten(m[1]) : null;
}

export function countyUrl(county: string, page: number, appSession: string | null): string {
  const base = `${CASPIO_BASE}?County=${encodeURIComponent(county)}&SPLocation=&SPNo=&SPLat=&SPLong=`;
  if (page === 1) return base;
  return (
    `${base}&appSession=${appSession}&PageID=2&PrevPageID=` +
    `&cpipage=${page}&CPISortType=&CPIorderBy=&cbCurrentPageSize=${PAGE_SIZE}`
  );
}

// ---------- fetching ----------

export interface FetchWqOptions {
  fetchImpl?: typeof fetch;
  counties?: readonly string[];
  concurrency?: number;
  /** Stop starting new counties after this long and report what was gathered. */
  deadlineMs?: number;
}

async function fetchText(url: string, doFetch: typeof fetch): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await doFetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { Accept: "text/html" },
      });
      if (res.ok) return await res.text();
      await res.body?.cancel();
      // A 4xx that is not rate limiting will not get better on a retry.
      if (res.status !== 429 && res.status < 500) throw new Error(`Caspio HTTP ${res.status}`);
      lastErr = new Error(`Caspio HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1) + Math.random() * 250));
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Bounded worker pool. The worker must not return anything large. */
async function mapPool<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function scrapeCounty(county: string, doFetch: typeof fetch): Promise<{ samples: WqSample[]; pages: number; rows: number }> {
  const sink = new Map<string, WqSample>();
  let session: string | null = null;
  let pages = 0;
  let rows = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    // Only counts and the session token cross this boundary. Never hold the page body.
    const html = await fetchText(countyUrl(county, page, session), doFetch);
    if (page === 1) session = extractAppSession(html);
    const n = parseResultSet(html, county, sink);
    pages++;
    rows += n;
    if (n === 0) break;
    if (n < PAGE_SIZE) break;
    if (!session) break;
  }
  return { samples: [...sink.values()], pages, rows };
}

export async function fetchWqSamples(opts: FetchWqOptions = {}): Promise<WqHarvest> {
  const doFetch = opts.fetchImpl ?? fetch;
  const counties = opts.counties ?? FDOH_COUNTIES;
  const startedAt = Date.now();
  const deadlineMs = opts.deadlineMs ?? 90_000;

  const results = await mapPool(counties, opts.concurrency ?? 6, async (county) => {
    if (Date.now() - startedAt > deadlineMs) return { county, samples: [] as WqSample[], pages: 0, rows: 0, failed: true };
    try {
      return { county, ...(await scrapeCounty(county, doFetch)), failed: false };
    } catch {
      return { county, samples: [] as WqSample[], pages: 0, rows: 0, failed: true };
    }
  });

  const samples: WqSample[] = [];
  const failedCounties: string[] = [];
  let pagesFetched = 0;
  let rowsParsed = 0;
  for (const r of results) {
    if (r.failed) failedCounties.push(r.county);
    pagesFetched += r.pages;
    rowsParsed += r.rows;
    for (const s of r.samples) samples.push(s);
  }
  return { samples, failedCounties, pagesFetched, rowsParsed };
}

// ---------- per-park reading ----------

/**
 * The worst recent reading within range, because an advisory at one end of a beach is the
 * fact that matters even if the next sampling point is clean.
 */
export function beachWaterFor(
  samples: WqSample[],
  park: { lat: number; lng: number; type?: string | null },
  now: Date = new Date(),
  maxKm = FDOH_MATCH_KM,
): BeachWaterQuality | null {
  if (park.type !== "beach") return null;
  const cutoff = now.getTime() - FDOH_MAX_AGE_DAYS * 24 * 3600e3;

  const rank: Record<BeachWaterLevel, number> = { good: 0, caution: 1, advisory: 2 };
  let best: { sample: WqSample; km: number } | null = null;

  for (const s of samples) {
    const t = Date.parse(s.date);
    if (!Number.isFinite(t) || t < cutoff) continue;
    const km = haversineKm(park.lat, park.lng, s.lat, s.lng);
    if (km > maxKm) continue;
    if (!best || rank[s.level] > rank[best.sample.level] || (rank[s.level] === rank[best.sample.level] && km < best.km)) {
      best = { sample: s, km };
    }
  }
  if (!best) return null;

  return {
    level: best.sample.level,
    label: BEACH_WATER_LABEL[best.sample.level],
    valueCfu: best.sample.valueCfu,
    station: best.sample.stationName,
    county: best.sample.county,
    sampledAt: best.sample.date,
    distanceKm: Math.round(best.km * 10) / 10,
    advisory: best.sample.advisory,
  };
}
