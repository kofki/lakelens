/**
 * Assembles one park_forecast row: NWS weather + the raw NWS gridpoint + EPA UV.
 *
 * Shape follows the pattern proven on the sibling forecast writer: columnar hourly arrays,
 * denormalised `now_*` fields so list and map cards need no expansion, and a `sources` map
 * recording which upstream answered. Open-Meteo is deliberately not a provider here.
 *
 * Only the weather fetch is allowed to fail the row. UV and the gridpoint extras degrade to
 * nulls and say so in `sources`, because a missing UV tile is better than a missing park.
 */
import { NWS_BASE, fetchNwsWeather, nwsFetchJson, type NwsWeatherOptions } from "./nws.ts";
import { fetchUvForPark, type UvPayload } from "./uv.ts";
import type {
  ForecastDay,
  HourlyColumnar,
  NwsGrid,
  ParkForecastRow,
  SourceStamp,
  WeatherPayload,
} from "./types.ts";

/** Hours of hourly series kept. The UI charts a day; the extra gives the strip room. */
export const HOURLY_HORIZON = 48;

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * NWS "feels like" in °F: Rothfusz heat index when warm and humid, wind chill when cold
 * and breezy, otherwise the air temperature unchanged.
 *
 * Florida almost always lands in the heat-index branch, which is the point: a 91 °F day at
 * 70 % humidity feels like 103 °F, and that is the number that decides whether a family
 * with small children should go at noon.
 */
export function feelsLikeF(tempF: number, humidityPct: number | null, windMph: number | null): number {
  if (tempF >= 80 && humidityPct != null && humidityPct >= 40) {
    const T = tempF;
    const R = humidityPct;
    const hi =
      -42.379 + 2.04901523 * T + 10.14333127 * R - 0.22475541 * T * R -
      0.00683783 * T * T - 0.05481717 * R * R + 0.00122874 * T * T * R +
      0.00085282 * T * R * R - 0.00000199 * T * T * R * R;
    return round1(hi);
  }
  if (tempF <= 50 && windMph != null && windMph >= 3) {
    const v = Math.pow(windMph, 0.16);
    return round1(35.74 + 0.6215 * tempF - 35.75 * v + 0.4275 * tempF * v);
  }
  return round1(tempF);
}

// ---------- raw gridpoint ----------

interface GridSeries {
  values?: { validTime: string; value: number | null }[];
}

export interface GridpointResponse {
  properties?: {
    updateTime?: string;
    probabilityOfThunder?: GridSeries;
    apparentTemperature?: GridSeries;
  };
}

const ISO_HOUR = (d: Date) => d.toISOString().slice(0, 13);

/**
 * NWS gridpoint series use ISO 8601 intervals ("2026-09-20T03:00:00+00:00/PT6H"), i.e. one
 * value covering several hours. Expand to a value per UTC hour so it can be zipped against
 * the hourly forecast.
 */
export function expandGridSeries(series: GridSeries | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const entry of series?.values ?? []) {
    if (entry?.value == null || !Number.isFinite(entry.value)) continue;
    const [startRaw, duration] = String(entry.validTime ?? "").split("/");
    const start = Date.parse(startRaw);
    if (Number.isNaN(start)) continue;
    const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(duration ?? "PT1H");
    const hours = m ? Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0) + (Number(m[3] ?? 0) > 0 ? 1 : 0) : 1;
    for (let h = 0; h < Math.max(1, hours); h++) {
      out.set(ISO_HOUR(new Date(start + h * 3600e3)), entry.value);
    }
  }
  return out;
}

/** Celsius is what the gridpoint uses for temperatures. */
function cToF(c: number): number {
  return (c * 9) / 5 + 32;
}

export interface GridExtras {
  issuedAt: string | null;
  thunder: Map<string, number>;
  apparentF: Map<string, number>;
}

export async function fetchGridExtras(grid: NwsGrid, opts: NwsWeatherOptions = {}): Promise<GridExtras> {
  const url = `${NWS_BASE}/gridpoints/${grid.gridId}/${grid.gridX},${grid.gridY}`;
  const json = await nwsFetchJson<GridpointResponse>(url, opts);
  const apparentC = expandGridSeries(json.properties?.apparentTemperature);
  const apparentF = new Map<string, number>();
  for (const [k, v] of apparentC) apparentF.set(k, round1(cToF(v)));
  return {
    issuedAt: json.properties?.updateTime ?? null,
    thunder: expandGridSeries(json.properties?.probabilityOfThunder),
    apparentF,
  };
}

// ---------- columnar hourly ----------

/**
 * Zip the NWS hourly forecast, the gridpoint extras and the EPA UV series into parallel
 * arrays on a fixed hourly step.
 *
 * UV comes back as local wall-clock hours with no offset, so it is matched by local hour
 * derived from the forecast timestamp's own offset rather than by absolute time.
 */
export function buildHourlyColumnar(
  weather: WeatherPayload,
  extras: GridExtras | null,
  uv: UvPayload | null,
): HourlyColumnar | null {
  const hours = (weather.hourly ?? []).slice(0, HOURLY_HORIZON);
  if (hours.length === 0) return null;

  const uvByHour = new Map<number, number>();
  for (const h of uv?.hours ?? []) uvByHour.set(h.hour, h.value);

  const cols: HourlyColumnar = {
    start_utc: new Date(Date.parse(hours[0].time)).toISOString(),
    n: hours.length,
    temp_f: [], apparent_f: [], pop: [], uv: [], wind_mph: [], thunder: [],
  };

  for (const h of hours) {
    const ms = Date.parse(h.time);
    const key = Number.isNaN(ms) ? "" : ISO_HOUR(new Date(ms));
    // "2026-09-20T14:00:00-04:00" -> local hour 14, which is the frame EPA uses.
    const localHour = Number(String(h.time).slice(11, 13));
    const temp = h.tempF;
    const apparent = extras?.apparentF.get(key);

    cols.temp_f.push(temp);
    cols.apparent_f.push(
      apparent != null ? apparent : temp != null ? feelsLikeF(temp, weather.current.humidity, weather.current.windMph) : null,
    );
    cols.pop.push(h.rainProb);
    cols.uv.push(Number.isFinite(localHour) ? uvByHour.get(localHour) ?? null : null);
    cols.wind_mph.push(null);
    cols.thunder.push(extras?.thunder.get(key) ?? null);
  }
  return cols;
}

function toDays(weather: WeatherPayload, uv: UvPayload | null): ForecastDay[] {
  const uvMaxToday = uv?.peak ?? null;
  return (weather.daily ?? []).slice(0, 7).map((d, i) => ({
    date: d.date,
    name: d.name,
    hi_f: d.highF,
    lo_f: d.lowF,
    pop: d.rainProb,
    // EPA returns one day only, so only today carries a UV maximum.
    uv_max: i === 0 ? uvMaxToday : null,
    short_forecast: d.shortForecast,
  }));
}

// ---------- assembly ----------

export interface ForecastPark {
  id: string;
  slug: string;
  name: string;
  lat: number;
  lng: number;
  coverage_tier?: string | null;
  nws_grid: NwsGrid | null;
  nws_zone?: string | null;
  nws_county?: string | null;
}

export interface AssembleForecastOptions extends NwsWeatherOptions {
  now?: Date;
  /** Injected in tests so the EPA call can be stubbed independently of NWS. */
  uvFetchImpl?: typeof fetch;
}

export async function assembleForecast(park: ForecastPark, opts: AssembleForecastOptions = {}): Promise<ParkForecastRow> {
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();

  const [weatherR, extrasR, uvR] = await Promise.allSettled([
    fetchNwsWeather(park, nowIso, opts),
    park.nws_grid ? fetchGridExtras(park.nws_grid, opts) : Promise.resolve(null),
    fetchUvForPark(park.lat, park.lng, { fetchImpl: opts.uvFetchImpl ?? opts.fetchImpl, now }),
  ]);

  // Weather is the only hard dependency: without it there is no row worth writing.
  if (weatherR.status !== "fulfilled" || !weatherR.value?.payload) {
    const reason = weatherR.status === "rejected" ? weatherR.reason : "no forecast returned";
    throw new Error(`weather failed for ${park.slug}: ${reason instanceof Error ? reason.message : String(reason)}`);
  }
  const weather = weatherR.value.payload;
  const extras = extrasR.status === "fulfilled" ? extrasR.value : null;
  const uv = uvR.status === "fulfilled" ? uvR.value : null;

  const sources: Record<string, SourceStamp> = {
    weather: { src: "nws", at: weather.fetchedAt },
    gridpoint: { src: "nws-gridpoint", at: extras?.issuedAt ?? (extras ? nowIso : null) },
    uv: { src: "epa", at: uv ? uv.fetchedAt : null },
    feels_like: { src: extras?.apparentF.size ? "nws-gridpoint" : "heat-index", at: nowIso },
  };

  const hourly = buildHourlyColumnar(weather, extras, uv);
  const nowKey = ISO_HOUR(now);
  const tempF = weather.current.tempF;

  return {
    park_id: park.id,
    forecast_at: nowIso,
    forecast_issued_at: extras?.issuedAt ?? null,
    now_temp_f: tempF,
    now_feels_like_f:
      extras?.apparentF.get(nowKey) ??
      (tempF != null ? feelsLikeF(tempF, weather.current.humidity, weather.current.windMph) : null),
    now_uv: uv?.now ?? uv?.peak ?? null,
    now_humidity: weather.current.humidity,
    now_wind_mph: weather.current.windMph,
    now_thunder_prob: extras?.thunder.get(nowKey) ?? null,
    now_short_forecast: weather.current.shortForecast || null,
    uv_peak: uv?.peak ?? null,
    uv_peak_hour: uv?.peakHour ?? null,
    hourly,
    daily: toDays(weather, uv),
    // Written by the algae job, which owns the column. Never overwritten here.
    water_quality: null,
    sources,
  };
}
