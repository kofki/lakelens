/**
 * NOAA CO-OPS (Tides & Currents) ingest — live water data for coastal parks.
 *
 * Coastal beaches and coastal lakes sit on no USGS river gauge, so their water data comes from
 * NOAA CO-OPS stations, exactly as BeachLens does ("Sourced from NOAA Station #8720218").
 * No API key is required; `application=LakeLens` identifies us.
 *
 * Station metadata (used by scripts/fetch-noaa-stations.ts, not at runtime):
 *   GET https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=watertemp
 *   GET https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=waterlevels
 *   GET https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions
 *   NOTE: `&state=FL` is IGNORED by this endpoint — it always returns every station, so callers
 *   must filter on the `state` field themselves.
 *
 * Observations / predictions (runtime):
 *   GET .../api/prod/datagetter?product=water_temperature&station=<id>&date=latest
 *       &units=english&time_zone=gmt&format=json&application=LakeLens
 *   GET .../api/prod/datagetter?product=water_level&...&datum=MLLW        (datum is REQUIRED)
 *   GET .../api/prod/datagetter?product=predictions&interval=hilo&datum=MLLW
 *       &begin_date=YYYYMMDD HH:mm&range=<hours>                          (`date=latest` is invalid here)
 *
 * Error envelope: NOAA answers `{"error":{"message":"..."}}` — usually with **HTTP 200** — for a
 * station that does not carry a product ("No data was found…"), and with HTTP 400 for a malformed
 * request ("Wrong Datum…"). Both are handled here; the first is a soft miss, not a failure.
 *
 * Times come back as "YYYY-MM-DD HH:MM" with NO zone marker; with time_zone=gmt they are UTC.
 *
 * Runtime-neutral: no Next/React/DOM imports; every call takes an injectable `fetchImpl` so tests
 * run against the fixtures in tests/fixtures/noaa-*.json.
 */
import type { NoaaPayload, NoaaReading, NoaaTide } from "./types.ts";

export const NOAA_DATAGETTER_URL = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
export const NOAA_MDAPI_STATIONS_URL = "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json";
export const NOAA_APPLICATION = "LakeLens";
export const NOAA_DATUM = "MLLW";

/** A reading older than this (at fetch time) is flagged `stale`. NOAA posts every 6 minutes. */
export const NOAA_STALE_MS = 3 * 3600e3;
/** How far ahead to ask for high/low tide predictions (hours). */
export const NOAA_TIDE_RANGE_HOURS = 36;
/** Politeness gap between stations (ms). The three products for ONE station go out together. */
export const NOAA_REQUEST_GAP_MS = 150;

export type NoaaProduct = "water_temperature" | "water_level" | "predictions";

/** What a station is known to publish; used to skip requests that would only return an error. */
export interface NoaaStationCapabilities {
  water_temp: boolean;
  water_level: boolean;
}

// ---------- raw response shapes (only the fields we read) ----------

export interface NoaaErrorEnvelope {
  error: { message: string };
}

export interface NoaaDataPoint {
  t: string; // "2026-09-19 23:12" (GMT when time_zone=gmt)
  v: string; // "84.0"
  f?: string;
  q?: string;
  s?: string;
}

export interface NoaaDataResponse {
  metadata?: { id: string; name: string; lat: string; lon: string };
  data?: NoaaDataPoint[];
  error?: { message: string };
}

export interface NoaaPredictionPoint {
  t: string;
  v: string;
  type: "H" | "L";
}

export interface NoaaPredictionsResponse {
  predictions?: NoaaPredictionPoint[];
  error?: { message: string };
}

/** Thrown for a real upstream failure. A "no data at this station" envelope is NOT an error. */
export class NoaaApiError extends Error {
  // Plain fields (not parameter properties): scripts/ run this file under
  // `node --experimental-strip-types`, which rejects parameter properties.
  station: string;
  product: NoaaProduct;
  constructor(message: string, station: string, product: NoaaProduct) {
    super(message);
    this.name = "NoaaApiError";
    this.station = station;
    this.product = product;
  }
}

// ---------- helpers ----------

/** NOAA says "No data was found…" when a station simply does not carry that product. */
export function isNoDataMessage(message: string): boolean {
  return /no data was found/i.test(message);
}

export function extractError(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const err = (json as NoaaErrorEnvelope).error;
  if (!err || typeof err !== "object") return null;
  const message = String(err.message ?? "").trim();
  return message.length > 0 ? message : "NOAA returned an empty error";
}

/** "2026-09-19 23:12" (GMT) -> "2026-09-19T23:12:00.000Z". Returns null for anything unparseable. */
export function parseNoaaTime(t: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(t ?? "").trim());
  if (!m) {
    const ms = Date.parse(String(t ?? ""));
    return Number.isNaN(ms) ? null : new Date(ms).toISOString();
  }
  const [, y, mo, d, h, mi, s] = m;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? "0"));
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

export function isStaleAt(timeIso: string, now: Date, maxAgeMs = NOAA_STALE_MS): boolean {
  const t = Date.parse(timeIso);
  if (Number.isNaN(t)) return true;
  return now.getTime() - t > maxAgeMs;
}

/** "YYYYMMDD HH:mm" in UTC, the only begin_date format the predictions product accepts here. */
export function noaaBeginDate(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())} ${p(now.getUTCHours())}:${p(now.getUTCMinutes())}`;
}

// ---------- url builders (exported for tests) ----------

export function buildDataUrl(station: string, product: "water_temperature" | "water_level"): string {
  const params = new URLSearchParams({
    product,
    station,
    date: "latest",
    units: "english",
    time_zone: "gmt",
    format: "json",
    application: NOAA_APPLICATION,
  });
  // water_level is rejected outright ("Wrong Datum") without an explicit datum.
  if (product === "water_level") params.set("datum", NOAA_DATUM);
  return `${NOAA_DATAGETTER_URL}?${params.toString()}`;
}

export function buildPredictionsUrl(station: string, now: Date, rangeHours = NOAA_TIDE_RANGE_HOURS): string {
  const params = new URLSearchParams({
    product: "predictions",
    station,
    begin_date: noaaBeginDate(now),
    range: String(rangeHours),
    interval: "hilo",
    units: "english",
    time_zone: "gmt",
    datum: NOAA_DATUM,
    format: "json",
    application: NOAA_APPLICATION,
  });
  return `${NOAA_DATAGETTER_URL}?${params.toString()}`;
}

export function buildStationsUrl(type: "watertemp" | "waterlevels" | "tidepredictions"): string {
  return `${NOAA_MDAPI_STATIONS_URL}?type=${type}`;
}

// ---------- normalizers (exported for tests) ----------

/**
 * datagetter observation response -> at most one reading (we always ask for `date=latest`).
 * Returns [] for the "No data was found" envelope; THROWS for any other error envelope.
 */
export function normalizeObservation(
  json: NoaaDataResponse,
  station: string,
  parameter: NoaaReading["parameter"],
  now: Date = new Date(),
): NoaaReading[] {
  const message = extractError(json);
  if (message !== null) {
    if (isNoDataMessage(message)) return [];
    throw new NoaaApiError(message, station, parameter === "water_temp" ? "water_temperature" : "water_level");
  }
  const unit = parameter === "water_temp" ? "degF" : "ft";
  const out: NoaaReading[] = [];
  for (const d of json?.data ?? []) {
    const value = toNumber(d?.v);
    const time = parseNoaaTime(d?.t ?? "");
    if (value === null || !time) continue;
    out.push({ station, parameter, value, unit, time, stale: isStaleAt(time, now) });
  }
  // newest first, keep one
  out.sort((a, b) => b.time.localeCompare(a.time));
  return out.slice(0, 1);
}

/**
 * predictions (interval=hilo) -> the FIRST high/low strictly after `now`.
 * Returns null for the "No data was found" envelope or an empty series; throws for other errors.
 */
export function normalizeNextTide(json: NoaaPredictionsResponse, station: string, now: Date = new Date()): NoaaTide | null {
  const message = extractError(json);
  if (message !== null) {
    if (isNoDataMessage(message)) return null;
    throw new NoaaApiError(message, station, "predictions");
  }
  const points = (json?.predictions ?? [])
    .map((p) => {
      const time = parseNoaaTime(p?.t ?? "");
      const valueFt = toNumber(p?.v);
      const type = p?.type === "H" || p?.type === "L" ? p.type : null;
      return time && valueFt !== null && type ? { type, time, valueFt } : null;
    })
    .filter((p): p is NoaaTide => p !== null)
    .sort((a, b) => a.time.localeCompare(b.time));
  return points.find((p) => Date.parse(p.time) > now.getTime()) ?? null;
}

// ---------- fetching ----------

export interface FetchNoaaOptions {
  fetchImpl?: typeof fetch;
  now?: Date;
  timeoutMs?: number;
  /** ms between stations (0 in tests) */
  gapMs?: number;
  /** station -> which products it publishes; unknown stations are asked for everything */
  capabilities?: Record<string, NoaaStationCapabilities>;
  /** stop starting new stations after this many ms */
  budgetMs?: number;
}

export interface NoaaStationResult {
  stationId: string;
  stationName: string | null;
  readings: NoaaReading[];
  nextTide: NoaaTide | null;
  errors: string[];
}

export type NoaaResultsByStation = Record<string, NoaaStationResult>;

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}

/**
 * One GET returning parsed JSON. NOAA answers its own error envelope with HTTP 200 (soft) or 400
 * (malformed request), so a 400 body is parsed rather than discarded; 5xx is retried once.
 */
export async function noaaGetJson<T>(url: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<T> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchImpl(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      // 400 carries the error envelope we want to surface verbatim; other non-2xx are transport errors.
      if (!res.ok && res.status !== 400) {
        if (res.status >= 500 && attempt === 0) {
          lastErr = new Error(`HTTP ${res.status} from tidesandcurrents.noaa.gov`);
          continue;
        }
        throw new Error(`HTTP ${res.status} from tidesandcurrents.noaa.gov`);
      }
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (attempt === 1) break;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Latest water temperature + water level + next high/low tide for each station.
 *
 * Stations are visited SEQUENTIALLY, NOAA_REQUEST_GAP_MS apart (polite); the two or three product
 * calls for a single station go out together so the whole job stays well inside the 30 s pg_net
 * timeout. A station that returns nothing yields an empty `readings` array rather than an error —
 * the UI shows "—" and "No live reading" for it. Never throws.
 */
export async function fetchNoaaLatest(stationIds: string[], opts: FetchNoaaOptions = {}): Promise<NoaaResultsByStation> {
  const stations = [...new Set(stationIds.map((s) => String(s ?? "").trim()).filter(Boolean))];
  const out: NoaaResultsByStation = {};
  if (stations.length === 0) return out;

  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? new Date();
  const timeoutMs = opts.timeoutMs ?? 10000;
  const gapMs = opts.gapMs ?? NOAA_REQUEST_GAP_MS;
  const startedAt = Date.now();

  for (let i = 0; i < stations.length; i++) {
    const station = stations[i];
    if (opts.budgetMs !== undefined && Date.now() - startedAt > opts.budgetMs) break;
    const caps = opts.capabilities?.[station];
    const wantTemp = caps ? caps.water_temp : true;
    const wantLevel = caps ? caps.water_level : true;

    const result: NoaaStationResult = { stationId: station, stationName: null, readings: [], nextTide: null, errors: [] };

    const jobs: Promise<void>[] = [];
    if (wantTemp) {
      jobs.push(
        (async () => {
          try {
            const json = await noaaGetJson<NoaaDataResponse>(buildDataUrl(station, "water_temperature"), fetchImpl, timeoutMs);
            result.stationName ??= json?.metadata?.name ?? null;
            result.readings.push(...normalizeObservation(json, station, "water_temp", now));
          } catch (err) {
            result.errors.push(`water_temperature: ${err instanceof Error ? err.message : String(err)}`);
          }
        })(),
      );
    }
    if (wantLevel) {
      jobs.push(
        (async () => {
          try {
            const json = await noaaGetJson<NoaaDataResponse>(buildDataUrl(station, "water_level"), fetchImpl, timeoutMs);
            result.stationName ??= json?.metadata?.name ?? null;
            result.readings.push(...normalizeObservation(json, station, "water_level", now));
          } catch (err) {
            result.errors.push(`water_level: ${err instanceof Error ? err.message : String(err)}`);
          }
        })(),
      );
    }
    jobs.push(
      (async () => {
        try {
          const json = await noaaGetJson<NoaaPredictionsResponse>(buildPredictionsUrl(station, now), fetchImpl, timeoutMs);
          result.nextTide = normalizeNextTide(json, station, now);
        } catch (err) {
          result.errors.push(`predictions: ${err instanceof Error ? err.message : String(err)}`);
        }
      })(),
    );
    await Promise.all(jobs);

    result.readings.sort((a, b) => a.parameter.localeCompare(b.parameter));
    out[station] = result;
    if (i < stations.length - 1) await sleep(gapMs);
  }
  return out;
}

// ---------- payload assembly ----------

export interface NoaaParkFields {
  noaa_station_id: string | null;
  noaa_distance_km?: number | null;
  name?: string;
}

function formatTempNote(value: number): string {
  return `${Math.round(value)}°F`;
}

/**
 * One park's `conditions_snapshots.payload` for source='noaa'. Always returns a payload, even when
 * the station answered nothing — `readings: []` is what makes the UI say "No live reading" rather
 * than invent a number.
 */
export function buildNoaaPayloadForPark(
  park: NoaaParkFields,
  resultsByStation: NoaaResultsByStation,
  fetchedAt: string | Date,
): NoaaPayload | null {
  const stationId = park.noaa_station_id ? String(park.noaa_station_id).trim() : "";
  if (!stationId) return null;
  const fetchedAtIso = typeof fetchedAt === "string" ? fetchedAt : fetchedAt.toISOString();
  const result = resultsByStation[stationId] ?? null;
  const readings = result?.readings ?? [];
  const temp = readings.find((r) => r.parameter === "water_temp" && !r.stale) ?? null;
  const level = readings.find((r) => r.parameter === "water_level" && !r.stale) ?? null;

  let note: string;
  if (temp && level) {
    note = `Water is ${formatTempNote(temp.value)} and the tide is ${level.value.toFixed(1)} ft above mean low water.`;
  } else if (temp) {
    note = `Water is ${formatTempNote(temp.value)} at this NOAA station.`;
  } else if (level) {
    note = `The tide is ${level.value.toFixed(1)} ft above mean low water at this NOAA station.`;
  } else if (readings.length > 0) {
    note = "The latest NOAA reading is more than 3 hours old, so we are not showing it as current.";
  } else {
    note = "No live reading from this NOAA station right now.";
  }

  return {
    source: "noaa",
    fetchedAt: fetchedAtIso,
    stationId,
    stationName: result?.stationName ?? null,
    distanceKm: park.noaa_distance_km ?? null,
    readings,
    nextTide: result?.nextTide ?? null,
    note,
  };
}
