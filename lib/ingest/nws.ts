/**
 * National Weather Service (api.weather.gov) ingest.
 *
 * - /points/{lat},{lng}  (4 decimals max; >4 dp => 301) -> grid + forecast URLs + zone/county UGC codes
 * - gridpoints .../forecast and .../forecast/hourly -> WeatherPayload (provider "nws")
 * - /alerts/active?area=FL  (ONE statewide call) -> matched to parks by UGC county/zone codes
 *
 * Headers: User-Agent (required; 403 without) from NWS_USER_AGENT, Accept: application/geo+json.
 * 2 retries on 5xx / network errors. Runtime-neutral: injectable fetchImpl for tests.
 */
import type { NwsGrid, Park, WeatherDay, WeatherHour, WeatherPayload } from "@/lib/types";

export const NWS_BASE = "https://api.weather.gov";
const DEFAULT_UA = "LakeLens/0.1 (https://lakelens.vercel.app)";

export interface NwsFetchOptions {
  fetchImpl?: typeof fetch;
  userAgent?: string;
  timeoutMs?: number;
  /** retries on 5xx or network failure (default 2) */
  retries?: number;
  /** delays before retry attempts (ms); index = attempt number */
  retryDelaysMs?: number[];
}

// ---------- raw shapes (subset) ----------

export interface NwsPeriod {
  number: number;
  name: string;
  startTime: string; // local ISO with offset
  endTime: string;
  isDaytime: boolean;
  temperature: number | null;
  temperatureUnit?: string;
  probabilityOfPrecipitation?: { value: number | null } | null;
  relativeHumidity?: { value: number | null } | null;
  windSpeed?: string | null;
  windDirection?: string | null;
  icon?: string | null;
  shortForecast: string;
  detailedForecast?: string;
}

export interface NwsForecastResponse {
  properties: {
    generatedAt?: string;
    updateTime?: string;
    periods: NwsPeriod[];
  };
}

export interface NwsPointsResponse {
  properties: {
    gridId: string;
    gridX: number;
    gridY: number;
    forecast: string;
    forecastHourly: string;
    forecastZone?: string | null; // URL ".../zones/forecast/FLZ021"
    county?: string | null; // URL ".../zones/county/FLC121"
    timeZone?: string | null;
  };
}

export interface NwsAlertFeature {
  id?: string;
  properties: {
    id: string; // urn:oid:... (also a URL at https://api.weather.gov/alerts/{id})
    event: string;
    severity?: string | null; // Extreme | Severe | Moderate | Minor | Unknown
    urgency?: string | null;
    certainty?: string | null;
    status?: string | null; // Actual | Test | ...
    messageType?: string | null; // Alert | Update | Cancel
    headline?: string | null;
    description?: string | null;
    instruction?: string | null;
    effective?: string | null;
    onset?: string | null;
    expires?: string | null;
    ends?: string | null;
    areaDesc?: string | null;
    senderName?: string | null;
    geocode?: { UGC?: string[]; SAME?: string[] } | null;
  };
}

export interface NwsAlertsResponse {
  features: NwsAlertFeature[];
  updated?: string;
}

export interface NwsPointsResult extends NwsGrid {
  /** "FLZ021" */
  zone: string | null;
  /** "FLC121" */
  county: string | null;
  timeZone: string | null;
}

// ---------- helpers ----------

export function roundCoord(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

export function nwsHeaders(userAgent?: string): Record<string, string> {
  return {
    "User-Agent": userAgent ?? process.env.NWS_USER_AGENT ?? DEFAULT_UA,
    Accept: "application/geo+json",
  };
}

/** "FLZ021" from "https://api.weather.gov/zones/forecast/FLZ021" or an already-bare code. */
export function ugcCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const last = value.trim().split("/").filter(Boolean).pop() ?? "";
  const code = last.toUpperCase();
  return /^[A-Z]{2}[CZ]\d{3}$/.test(code) ? code : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET JSON with NWS headers; retries on 5xx / network errors (not on 4xx). */
export async function nwsFetchJson<T>(url: string, opts: NwsFetchOptions = {}): Promise<T> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const retries = opts.retries ?? 2;
  const delays = opts.retryDelaysMs ?? [500, 1500];
  const timeoutMs = opts.timeoutMs ?? 12000;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(delays[attempt - 1] ?? 1000);
    try {
      const res = await fetchImpl(url, {
        headers: nwsHeaders(opts.userAgent),
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return (await res.json()) as T;
      const err = new Error(`NWS HTTP ${res.status} for ${url}`);
      if (res.status >= 500 || res.status === 429) {
        lastErr = err;
        continue;
      }
      throw err;
    } catch (err) {
      lastErr = err;
      if (err instanceof Error && /HTTP 4\d\d/.test(err.message) && !/429/.test(err.message)) throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// ---------- endpoints ----------

export function parsePoints(json: NwsPointsResponse): NwsPointsResult {
  const p = json.properties;
  return {
    gridId: p.gridId,
    gridX: p.gridX,
    gridY: p.gridY,
    forecast: p.forecast,
    forecastHourly: p.forecastHourly,
    zone: ugcCode(p.forecastZone),
    county: ugcCode(p.county),
    timeZone: p.timeZone ?? null,
  };
}

export async function fetchPoints(lat: number, lng: number, opts: NwsFetchOptions = {}): Promise<NwsPointsResult> {
  const url = `${NWS_BASE}/points/${roundCoord(lat)},${roundCoord(lng)}`;
  return parsePoints(await nwsFetchJson<NwsPointsResponse>(url, opts));
}

function forecastUrl(grid: Pick<NwsGrid, "forecast"> | Pick<NwsGrid, "gridId" | "gridX" | "gridY">): string {
  if ("forecast" in grid && grid.forecast) return grid.forecast;
  const g = grid as NwsGrid;
  return `${NWS_BASE}/gridpoints/${g.gridId}/${g.gridX},${g.gridY}/forecast`;
}

export async function fetchForecast(grid: NwsGrid, opts: NwsFetchOptions = {}): Promise<NwsForecastResponse> {
  return nwsFetchJson<NwsForecastResponse>(forecastUrl(grid), opts);
}

export async function fetchHourly(grid: NwsGrid, opts: NwsFetchOptions = {}): Promise<NwsForecastResponse> {
  const url = grid.forecastHourly || `${forecastUrl(grid)}/hourly`;
  return nwsFetchJson<NwsForecastResponse>(url, opts);
}

/** One statewide call. Returns the raw features; match per park with matchAlertsToPark. */
export async function fetchAlertsFL(opts: NwsFetchOptions = {}): Promise<NwsAlertFeature[]> {
  const json = await nwsFetchJson<NwsAlertsResponse>(`${NWS_BASE}/alerts/active?area=FL`, opts);
  return json.features ?? [];
}

/**
 * Match statewide alert features to one park by UGC codes: the park's county (FLCxxx) and
 * forecast zone (FLZxxx). Cancel messages and non-Actual statuses are excluded.
 */
export function matchAlertsToPark(features: NwsAlertFeature[], park: Pick<Park, "nws_zone" | "nws_county">): NwsAlertFeature[] {
  const codes = new Set([ugcCode(park.nws_zone), ugcCode(park.nws_county)].filter((c): c is string => !!c));
  if (codes.size === 0) return [];
  return features.filter((f) => {
    const p = f.properties;
    if (!p) return false;
    if ((p.messageType ?? "").toLowerCase() === "cancel") return false;
    if (p.status && p.status.toLowerCase() !== "actual") return false;
    return (p.geocode?.UGC ?? []).some((u) => codes.has(u.toUpperCase()));
  });
}

// ---------- normalization ----------

export function parseWindMph(s: string | null | undefined): number | null {
  if (!s) return null;
  const nums = s.match(/\d+(\.\d+)?/g);
  if (!nums || nums.length === 0) return null;
  return Math.max(...nums.map(Number));
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Weekday label from a YYYY-MM-DD string (timezone-safe). */
export function weekdayShort(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : WEEKDAY[d.getUTCDay()];
}

function pop(p: NwsPeriod | undefined): number | null {
  const v = p?.probabilityOfPrecipitation?.value;
  return typeof v === "number" ? v : null;
}

function maxOrNull(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number");
  return nums.length ? Math.max(...nums) : null;
}
function minOrNull(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number");
  return nums.length ? Math.min(...nums) : null;
}

/** forecast (12-h periods) + hourly -> WeatherPayload. `fetchedAt` is an ISO timestamp. */
export function normalizeNws(forecast: NwsForecastResponse, hourly: NwsForecastResponse | null, fetchedAt: string): WeatherPayload {
  const periods = forecast?.properties?.periods ?? [];
  const hours = hourly?.properties?.periods ?? [];

  // group 12-h periods and hourly periods by local date (startTime carries the local offset)
  const byDate = new Map<string, NwsPeriod[]>();
  for (const p of periods) {
    const d = p.startTime.slice(0, 10);
    (byDate.get(d) ?? byDate.set(d, []).get(d)!).push(p);
  }
  const hoursByDate = new Map<string, NwsPeriod[]>();
  for (const h of hours) {
    const d = h.startTime.slice(0, 10);
    (hoursByDate.get(d) ?? hoursByDate.set(d, []).get(d)!).push(h);
  }

  const daily: WeatherDay[] = [...byDate.entries()].slice(0, 7).map(([date, ps]) => {
    const day = ps.find((p) => p.isDaytime);
    const night = ps.find((p) => !p.isDaytime);
    const hs = hoursByDate.get(date) ?? [];
    const highF = day?.temperature ?? maxOrNull(hs.map((h) => h.temperature));
    const lowF = night?.temperature ?? minOrNull(hs.map((h) => h.temperature));
    const lead = day ?? ps[0];
    return {
      date,
      name: weekdayShort(date),
      highF: highF ?? null,
      lowF: lowF ?? null,
      rainProb: maxOrNull([...ps.map(pop), ...hs.map(pop)]),
      shortForecast: lead?.shortForecast ?? "",
      icon: lead?.icon ?? null,
    };
  });

  const first = hours[0] ?? periods[0];
  const current: WeatherPayload["current"] = {
    tempF: first?.temperature ?? null,
    shortForecast: first?.shortForecast ?? "",
    windMph: parseWindMph(first?.windSpeed),
    humidity: typeof first?.relativeHumidity?.value === "number" ? first.relativeHumidity.value : null,
    icon: first?.icon ?? null,
  };

  const hourlyOut: WeatherHour[] = hours.slice(0, 24).map((h) => ({
    time: h.startTime,
    tempF: h.temperature ?? null,
    rainProb: pop(h),
    shortForecast: h.shortForecast ?? "",
  }));

  const today = daily[0];
  return {
    provider: "nws",
    fetchedAt,
    current,
    today: {
      highF: today?.highF ?? null,
      lowF: today?.lowF ?? null,
      rainProbMax: today?.rainProb ?? null,
    },
    hourly: hourlyOut,
    daily,
  };
}

/** Convenience: points (if grid missing) + forecast + hourly -> payload. */
export async function fetchNwsWeather(
  park: Pick<Park, "lat" | "lng" | "nws_grid">,
  fetchedAt: string,
  opts: NwsFetchOptions = {},
): Promise<{ payload: WeatherPayload; points: NwsPointsResult | null }> {
  let grid: NwsGrid | null = park.nws_grid;
  let points: NwsPointsResult | null = null;
  if (!grid || !grid.forecast) {
    points = await fetchPoints(park.lat, park.lng, opts);
    grid = { gridId: points.gridId, gridX: points.gridX, gridY: points.gridY, forecast: points.forecast, forecastHourly: points.forecastHourly };
  }
  const [forecast, hourly] = await Promise.all([fetchForecast(grid, opts), fetchHourly(grid, opts)]);
  return { payload: normalizeNws(forecast, hourly, fetchedAt), points };
}
