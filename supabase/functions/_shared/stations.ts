/**
 * Station assignment: which USGS gauge, NOAA CO-OPS station and NWS grid each park uses.
 *
 * This used to be three seed-time scripts writing data/gauges.json, data/noaa_stations.json
 * and data/osm-cache/nws-points*, which the seed builder folded into the parks table. Two
 * problems with that: data/noaa_stations.json was never wired into build-seed.ts, so a
 * rebuilt project came up with zero NOAA coverage; and gauges go offline, so a park could
 * sit pointed at a dead sensor until someone noticed and re-ran a script by hand.
 *
 * Running it on a schedule makes coverage self-healing: any park missing an assignment
 * gets one as soon as a station near it starts reporting.
 *
 * Only parks that are MISSING an assignment are touched. Curated overrides are never
 * overwritten — a park with a hand-picked gauge keeps it.
 */
import {
  type SiteLiveness,
  type UsgsSiteRecord,
  haversineKm,
  isLiveReading,
  parseRdbSites,
  selectGauges,
  usgsSitesUrl,
} from "./gauges.ts";
import { NOAA_APPLICATION, buildStationsUrl, noaaGetJson } from "./noaa.ts";
import { fetchPoints } from "./nws.ts";
import type { NwsGrid, ParkLike } from "./types.ts";

/** Inland parks never borrow a tide gauge; coastal parks accept one this far away. */
export const NOAA_MAX_KM = 40;
/** Beaches tolerate a more distant station: sea-surface temperature varies slowly along a coast. */
export const NOAA_BEACH_MAX_KM = 75;

export interface StationCandidate {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface MdapiStation {
  id?: string;
  name?: string;
  lat?: number | string;
  lng?: number | string;
  state?: string;
}

const FL_REGION = new Set(["FL", "GA", "AL"]);

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : null;
}

/** NOAA's station metadata API, flattened and limited to the region we cover. */
export function parseStations(json: { stations?: MdapiStation[] }): StationCandidate[] {
  const out: StationCandidate[] = [];
  for (const s of json.stations ?? []) {
    const lat = num(s.lat);
    const lng = num(s.lng);
    if (!s.id || lat === null || lng === null) continue;
    if (s.state && !FL_REGION.has(s.state.trim().toUpperCase())) continue;
    out.push({ id: String(s.id), name: s.name ?? String(s.id), lat, lng });
  }
  return out;
}

/** Nearest station to the park, or null when the closest is further than this park type allows. */
export function nearestStation(
  park: Pick<ParkLike, "lat" | "lng"> & { type?: string | null },
  stations: ReadonlyArray<StationCandidate>,
): { station: StationCandidate; km: number } | null {
  const limit = park.type === "beach" ? NOAA_BEACH_MAX_KM : NOAA_MAX_KM;
  let best: { station: StationCandidate; km: number } | null = null;
  for (const station of stations) {
    const km = haversineKm(park.lat, park.lng, station.lat, station.lng);
    if (km <= limit && (!best || km < best.km)) best = { station, km };
  }
  return best;
}

export interface StationFetchOptions {
  fetchImpl?: typeof fetch;
  userAgent?: string;
  timeoutMs?: number;
}

/** Stations that report water temperature, then water level — temperature is what the UI leads with. */
export async function fetchNoaaStationCandidates(opts: StationFetchOptions = {}): Promise<StationCandidate[]> {
  const doFetch = opts.fetchImpl ?? fetch;
  const byId = new Map<string, StationCandidate>();
  for (const type of ["watertemp", "waterlevels"] as const) {
    const json = await noaaGetJson<{ stations?: MdapiStation[] }>(buildStationsUrl(type), doFetch, opts.timeoutMs ?? 20_000);
    for (const s of parseStations(json)) if (!byId.has(s.id)) byId.set(s.id, s);
  }
  return [...byId.values()];
}

/** USGS site service, as RDB, for the bounding box around one park. */
export async function fetchUsgsSiteCandidates(
  park: Pick<ParkLike, "lat" | "lng">,
  opts: StationFetchOptions = {},
): Promise<UsgsSiteRecord[]> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(usgsSitesUrl(park.lat, park.lng), {
    headers: { "User-Agent": opts.userAgent ?? `${NOAA_APPLICATION}/1.0` },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
  });
  // 404 is the site service's "no sites in this box" — an empty result, not a failure.
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`usgs site service: HTTP ${res.status}`);
  return parseRdbSites(await res.text());
}

/**
 * Which of these sites are actually reporting now.
 *
 * A gauge that exists but stopped transmitting is worse than no gauge: it is exactly the
 * retired-sensor case that put a 309-day-old water temperature on the park page.
 */
export async function fetchSiteLiveness(
  siteIds: ReadonlyArray<string>,
  now: Date,
  opts: StationFetchOptions = {},
): Promise<Record<string, SiteLiveness>> {
  const out: Record<string, SiteLiveness> = {};
  if (siteIds.length === 0) return out;
  const doFetch = opts.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    monitoring_location_id: siteIds.map((s) => `USGS-${s}`).join(","),
    parameter_code: "00060,00065,00010",
    limit: "1000",
  });
  const res = await doFetch(`https://api.waterdata.usgs.gov/ogcapi/v1/collections/latest-continuous/items?${params}`, {
    headers: { Accept: "application/json", "User-Agent": opts.userAgent ?? `${NOAA_APPLICATION}/1.0` },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
  });
  if (!res.ok) throw new Error(`usgs latest-continuous: HTTP ${res.status}`);
  const json = (await res.json()) as {
    features?: { properties: { monitoring_location_id: string; parameter_code: string; time: string; value: unknown } }[];
  };
  for (const f of json.features ?? []) {
    const p = f.properties;
    if (!isLiveReading(p.time, now)) continue;
    if (p.value === null || p.value === undefined) continue;
    const site = String(p.monitoring_location_id).replace(/^USGS-/i, "");
    const entry = (out[site] ??= { discharge: false, level: false });
    if (p.parameter_code === "00060") entry.discharge = true;
    if (p.parameter_code === "00065") entry.level = true;
  }
  return out;
}

export interface GaugeAssignment {
  usgs_site_id: string | null;
  river_gauge_site_id: string | null;
  gauge_distance_km: number | null;
}

/** Discover and rank gauges for one park. Returns null when nothing live is in range. */
export async function assignGauges(
  park: Pick<ParkLike, "lat" | "lng">,
  now: Date,
  opts: StationFetchOptions = {},
): Promise<GaugeAssignment | null> {
  const sites = await fetchUsgsSiteCandidates(park, opts);
  if (sites.length === 0) return null;
  const live = await fetchSiteLiveness(sites.map((s) => s.site_no), now, opts);
  const picked = selectGauges(park, sites, live);
  if (!picked.usgs_site_id && !picked.river_gauge_site_id) return null;
  return {
    usgs_site_id: picked.usgs_site_id,
    river_gauge_site_id: picked.river_gauge_site_id,
    gauge_distance_km: picked.gauge_distance_km,
  };
}

/** NWS grid for one park, so the weather job can stop re-resolving it every run. */
export async function assignNwsGrid(
  park: Pick<ParkLike, "lat" | "lng">,
  opts: StationFetchOptions = {},
): Promise<{ nws_grid: NwsGrid; nws_zone: string | null; nws_county: string | null }> {
  const points = await fetchPoints(park.lat, park.lng, { fetchImpl: opts.fetchImpl, userAgent: opts.userAgent });
  return {
    nws_grid: {
      gridId: points.gridId,
      gridX: points.gridX,
      gridY: points.gridY,
      forecast: points.forecast,
      forecastHourly: points.forecastHourly,
    },
    nws_zone: points.zone ?? null,
    nws_county: points.county ?? null,
  };
}
