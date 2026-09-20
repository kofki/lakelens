/**
 * Shared ingest types: the single source of truth for the payloads written to
 * conditions_snapshots and for the park fields the fetchers touch.
 *
 * This file lives under supabase/functions/ so the `refresh-conditions` Edge Function
 * (Deno) can import it directly, and lib/types.ts re-exports it so the Next.js app and
 * vitest use exactly the same definitions. Keep it free of Deno/Node APIs.
 */

/** The park columns the fetchers read. `Park` in lib/types.ts is structurally assignable. */
export interface ParkLike {
  id: string;
  slug: string;
  name: string;
  lat: number;
  lng: number;
  nws_grid: NwsGrid | null;
  nws_zone: string | null;
  nws_county: string | null;
  usgs_site_id: string | null;
  river_gauge_site_id: string | null;
  gauge_distance_km: number | null;
  noaa_station_id?: string | null;
  noaa_distance_km?: number | null;
}

export interface NwsGrid {
  gridId: string;
  gridX: number;
  gridY: number;
  forecast: string;
  forecastHourly: string;
}

export interface Holiday {
  date: string; // YYYY-MM-DD (observed date)
  name: string;
}

export interface LongWeekend {
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
}


// ---------- ingest payloads (stored in conditions_snapshots.payload) ----------
export type UsgsParameter = "00060" | "00065" | "00010" | "63160";

export interface UsgsReading {
  site: string; // "02322700"
  parameter: UsgsParameter;
  value: number;
  unit: string; // "ft3/s" | "ft" | "degC"
  time: string; // ISO UTC
  stale: boolean; // older than 6 h at fetch time
  provisional: boolean;
}

export interface UsgsPayload {
  source: "usgs-ogc" | "usgs-legacy";
  fetchedAt: string;
  readings: UsgsReading[];
  /** "high" when discharge is well above a typical baseline; see lib/ingest/usgs.ts */
  flowFlag: "normal" | "high" | "unknown";
  flowNote: string | null;
}

/** NOAA CO-OPS parameters we surface. `water_level` is a tide height above MLLW. */
export type NoaaParameter = "water_temp" | "water_level";

export interface NoaaReading {
  station: string; // "8720218"
  parameter: NoaaParameter;
  value: number;
  unit: string; // "degF" | "ft"
  time: string; // ISO UTC
  stale: boolean; // older than 3 h at fetch time
}

export interface NoaaTide {
  type: "H" | "L";
  time: string; // ISO UTC
  valueFt: number;
}

export interface NoaaPayload {
  source: "noaa";
  fetchedAt: string;
  stationId: string;
  stationName: string | null;
  /** km from the park to the station, when known */
  distanceKm: number | null;
  readings: NoaaReading[];
  nextTide: NoaaTide | null;
  note: string | null;
}

export interface WeatherHour {
  time: string; // ISO local with offset
  tempF: number | null;
  rainProb: number | null;
  shortForecast: string;
}

export interface WeatherDay {
  date: string; // YYYY-MM-DD
  name: string; // "Sat"
  highF: number | null;
  lowF: number | null;
  rainProb: number | null;
  shortForecast: string;
  icon: string | null;
}

export interface WeatherPayload {
  /** Always "nws": the National Weather Service is the only weather provider. */
  provider: "nws";
  fetchedAt: string;
  current: {
    tempF: number | null;
    shortForecast: string;
    windMph: number | null;
    humidity: number | null;
    icon: string | null;
  };
  today: {
    highF: number | null;
    lowF: number | null;
    rainProbMax: number | null;
  };
  hourly: WeatherHour[];
  daily: WeatherDay[];
}

/** Jobs the refresh-conditions Edge Function can run (also the pg_cron job names). */
export type CronJob = "usgs" | "noaa" | "weather" | "alerts" | "holidays" | "prune" | "algae" | "parking" | "stations" | "forecast";

/** Shape of a park_alerts row the ingest jobs insert. */
export interface ParkAlertInsert {
  park_id: string;
  kind: string;
  text: string;
  source: string;
  official_url?: string | null;
  severity?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  hash: string;
  active?: boolean;
  last_checked_at?: string | null;
  first_seen?: string | null;
  last_seen?: string | null;
}

// ---------------------------------------------------------------------------
// park_forecast: one upserted row per park (see supabase/migrations/*_park_forecast.sql)
// ---------------------------------------------------------------------------

/**
 * Hourly series stored as parallel arrays rather than an array of objects.
 *
 * A park page ships its forecast twice (HTML plus the RSC payload), so 72 hourly objects
 * with ten keys each is most of a document. Columnar arrays with an implicit hourly step
 * from `start_utc` carry the same numbers in a fraction of the bytes.
 */
export interface HourlyColumnar {
  /** ISO UTC of index 0. Each subsequent index is one hour later. */
  start_utc: string;
  n: number;
  temp_f: (number | null)[];
  apparent_f: (number | null)[];
  pop: (number | null)[];
  uv: (number | null)[];
  wind_mph: (number | null)[];
  thunder: (number | null)[];
}

export interface ForecastDay {
  date: string;
  name: string;
  hi_f: number | null;
  lo_f: number | null;
  pop: number | null;
  uv_max: number | null;
  short_forecast: string;
}

/** Which upstream supplied a field, and when. Null `at` means the source failed this run. */
export interface SourceStamp {
  src: string;
  at: string | null;
}

export type WaterQualityLevel = "clear" | "caution" | "avoid";

export interface WaterQuality {
  level: WaterQualityLevel;
  label: string;
  sampledAt: string;
  distanceKm: number;
  location: string | null;
  microcystin: string | null;
}

export interface ParkForecastRow {
  park_id: string;
  forecast_at: string;
  forecast_issued_at: string | null;
  now_temp_f: number | null;
  now_feels_like_f: number | null;
  now_uv: number | null;
  now_humidity: number | null;
  now_wind_mph: number | null;
  now_thunder_prob: number | null;
  now_short_forecast: string | null;
  uv_peak: number | null;
  uv_peak_hour: number | null;
  hourly: HourlyColumnar | null;
  daily: ForecastDay[];
  water_quality: WaterQuality | null;
  sources: Record<string, SourceStamp>;
}
