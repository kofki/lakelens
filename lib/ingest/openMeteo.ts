/**
 * Open-Meteo forecast (automatic fallback when NWS fails; CC BY 4.0 attribution on /about).
 *
 * GET https://api.open-meteo.com/v1/forecast?latitude=&longitude=
 *   &current=temperature_2m,precipitation,weather_code,wind_speed_10m,relative_humidity_2m
 *   &hourly=temperature_2m,precipitation_probability,precipitation,weather_code
 *   &daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,uv_index_max
 *   &temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FNew_York&forecast_days=7
 *
 * Times come back LOCAL WITHOUT an offset ("2026-09-19T00:00"); we append the offset derived
 * from utc_offset_seconds so WeatherHour.time is "ISO local with offset" like the NWS payload.
 * No API key, no User-Agent requirement. Runtime-neutral; injectable fetchImpl.
 */
import type { WeatherDay, WeatherHour, WeatherPayload } from "@/lib/types";

export const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

export interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  utc_offset_seconds: number;
  timezone: string;
  current?: {
    time: string;
    interval?: number;
    temperature_2m: number | null;
    precipitation?: number | null;
    weather_code: number | null;
    wind_speed_10m: number | null;
    relative_humidity_2m: number | null;
  };
  hourly?: {
    time: string[];
    temperature_2m: (number | null)[];
    precipitation_probability: (number | null)[];
    precipitation?: (number | null)[];
    weather_code: (number | null)[];
  };
  daily?: {
    time: string[];
    weather_code: (number | null)[];
    temperature_2m_max: (number | null)[];
    temperature_2m_min: (number | null)[];
    precipitation_probability_max: (number | null)[];
    precipitation_sum?: (number | null)[];
    uv_index_max?: (number | null)[];
  };
}

/** Small WMO weather-code map (plain language). Kept local so ingest never imports LOGIC. */
const WMO_TEXT: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Freezing fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Heavy freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Heavy freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light showers",
  81: "Showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with heavy hail",
};

export function wmoText(code: number | null | undefined): string {
  if (code === null || code === undefined) return "";
  return WMO_TEXT[code] ?? "Unknown conditions";
}

/** "-04:00" from utc_offset_seconds = -14400 */
export function offsetString(utcOffsetSeconds: number): string {
  const sign = utcOffsetSeconds < 0 ? "-" : "+";
  const abs = Math.abs(utcOffsetSeconds);
  const hh = String(Math.floor(abs / 3600)).padStart(2, "0");
  const mm = String(Math.floor((abs % 3600) / 60)).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function weekdayShort(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : WEEKDAY[d.getUTCDay()];
}

function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function buildOpenMeteoUrl(lat: number, lng: number, forecastDays = 7): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: "temperature_2m,precipitation,weather_code,wind_speed_10m,relative_humidity_2m",
    hourly: "temperature_2m,precipitation_probability,precipitation,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,uv_index_max",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    precipitation_unit: "inch",
    timezone: "America/New_York",
    forecast_days: String(forecastDays),
  });
  return `${OPEN_METEO_URL}?${params.toString()}`;
}

/** Open-Meteo JSON -> WeatherPayload (provider "open-meteo"). Exported for tests. */
export function normalizeOpenMeteo(json: OpenMeteoResponse, fetchedAt: string): WeatherPayload {
  const off = offsetString(json.utc_offset_seconds ?? 0);
  const cur = json.current;
  const h = json.hourly;
  const d = json.daily;

  // hourly: start at the current hour (Open-Meteo returns from local midnight), take 24
  let start = 0;
  if (h?.time?.length && cur?.time) {
    const curHour = cur.time.slice(0, 13); // "2026-09-19T01"
    const idx = h.time.findIndex((t) => t.slice(0, 13) >= curHour);
    start = idx >= 0 ? idx : 0;
  }
  const hourly: WeatherHour[] = (h?.time ?? []).slice(start, start + 24).map((t, i) => {
    const j = start + i;
    return {
      time: `${t}${off}`,
      tempF: num(h?.temperature_2m?.[j]),
      rainProb: num(h?.precipitation_probability?.[j]),
      shortForecast: wmoText(h?.weather_code?.[j]),
    };
  });

  const daily: WeatherDay[] = (d?.time ?? []).slice(0, 7).map((date, i) => ({
    date,
    name: weekdayShort(date),
    highF: num(d?.temperature_2m_max?.[i]),
    lowF: num(d?.temperature_2m_min?.[i]),
    rainProb: num(d?.precipitation_probability_max?.[i]),
    shortForecast: wmoText(d?.weather_code?.[i]),
    icon: null,
  }));

  const today = daily[0];
  return {
    provider: "open-meteo",
    fetchedAt,
    current: {
      tempF: num(cur?.temperature_2m),
      shortForecast: wmoText(cur?.weather_code),
      windMph: num(cur?.wind_speed_10m),
      humidity: num(cur?.relative_humidity_2m),
      icon: null,
    },
    today: {
      highF: today?.highF ?? null,
      lowF: today?.lowF ?? null,
      rainProbMax: today?.rainProb ?? null,
    },
    hourly,
    daily,
  };
}

export interface OpenMeteoOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  fetchedAt?: string;
}

export async function fetchOpenMeteo(lat: number, lng: number, opts: OpenMeteoOptions = {}): Promise<WeatherPayload> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(buildOpenMeteoUrl(lat, lng), {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(opts.timeoutMs ?? 12000),
  });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const json = (await res.json()) as OpenMeteoResponse;
  return normalizeOpenMeteo(json, opts.fetchedAt ?? new Date().toISOString());
}
