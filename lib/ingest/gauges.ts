/**
 * Nearest-USGS-gauge selection (pure; used by scripts/fetch-usgs-sites.ts and tests).
 *
 * Candidates come from the USGS Site Service in RDB (tab-separated) form:
 *   GET https://waterservices.usgs.gov/nwis/site/?format=rdb&bBox=<lng-0.15>,<lat-0.15>,<lng+0.15>,<lat+0.15>
 *       &siteType=SP,ST&siteStatus=active&hasDataTypeCd=iv
 * Liveness (a 00060 discharge or 00065 gage-height reading no older than 24 h) is checked by the
 * caller against the OGC latest-continuous collection and passed in as `live`.
 *
 * Selection rules (see selectGauges):
 *   usgs_site_id        nearest LIVE spring (SP) site within SPRING_MAX_KM of the swim area
 *   river_gauge_site_id nearest LIVE site within RIVER_MAX_KM that has a discharge series
 *                       (falls back to the nearest live level-only site); never the same site
 *   gauge_distance_km   distance to the river gauge, else to the spring gauge (1 dp)
 *
 * No runtime imports so `node --experimental-strip-types` can load it from scripts/.
 */

export const SPRING_MAX_KM = 1;
export const RIVER_MAX_KM = 15;
/** A latest reading older than this does not count as "live" for gauge selection. */
export const LIVE_MAX_AGE_MS = 24 * 3600e3;
export const USGS_SITE_SERVICE_URL = "https://waterservices.usgs.gov/nwis/site/";
/** Half-width of the search box in degrees (~16 km N-S at Florida latitudes). */
export const BBOX_DELTA_DEG = 0.15;

export interface UsgsSiteRecord {
  site_no: string;
  station_nm: string;
  /** "SP" spring, "ST" stream (others are dropped by the caller's siteType filter) */
  site_tp_cd: string;
  lat: number;
  lng: number;
}

/** Which live series a site currently has (both false = not live). */
export interface SiteLiveness {
  discharge: boolean;
  level: boolean;
}

export interface GaugeSelection {
  usgs_site_id: string | null;
  river_gauge_site_id: string | null;
  gauge_distance_km: number | null;
  site_names: Record<string, string>;
}

export function bboxParam(lat: number, lng: number, delta = BBOX_DELTA_DEG): string {
  const f = (n: number) => n.toFixed(5);
  return `${f(lng - delta)},${f(lat - delta)},${f(lng + delta)},${f(lat + delta)}`;
}

export function usgsSitesUrl(lat: number, lng: number): string {
  const params = new URLSearchParams({
    format: "rdb",
    bBox: bboxParam(lat, lng),
    siteType: "SP,ST",
    siteStatus: "active",
    hasDataTypeCd: "iv",
  });
  return `${USGS_SITE_SERVICE_URL}?${params.toString()}`;
}

/** Parse USGS RDB: '#' comment lines, a header row, a column-format row ("5s\t15s..."), then data rows. */
export function parseRdbSites(text: string): UsgsSiteRecord[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0 && !l.startsWith("#"));
  if (lines.length < 2) return [];
  const header = lines[0].split("\t");
  const col = (name: string) => header.indexOf(name);
  const iSite = col("site_no");
  const iName = col("station_nm");
  const iType = col("site_tp_cd");
  const iLat = col("dec_lat_va");
  const iLng = col("dec_long_va");
  if ([iSite, iName, iType, iLat, iLng].some((i) => i < 0)) return [];
  const out: UsgsSiteRecord[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split("\t");
    if (/^\d+s$/.test(cells[0] ?? "")) continue; // column-format row
    const lat = Number(cells[iLat]);
    const lng = Number(cells[iLng]);
    const site_no = (cells[iSite] ?? "").trim();
    if (!site_no || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({ site_no, station_nm: (cells[iName] ?? "").trim(), site_tp_cd: (cells[iType] ?? "").trim(), lat, lng });
  }
  return out;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function isLiveReading(timeIso: string, now: Date, maxAgeMs = LIVE_MAX_AGE_MS): boolean {
  const t = Date.parse(timeIso);
  return !Number.isNaN(t) && now.getTime() - t <= maxAgeMs;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Pick the park's own spring gauge and its river gauge from the site-service candidates.
 * `live` maps site_no -> liveness; sites missing from it are treated as not live.
 */
export function selectGauges(
  park: { lat: number; lng: number },
  sites: UsgsSiteRecord[],
  live: Record<string, SiteLiveness>,
): GaugeSelection {
  const ranked = sites
    .map((s) => ({ ...s, km: haversineKm(park.lat, park.lng, s.lat, s.lng), live: live[s.site_no] ?? { discharge: false, level: false } }))
    .filter((s) => s.live.discharge || s.live.level)
    .sort((a, b) => a.km - b.km);

  const spring = ranked.find((s) => s.site_tp_cd === "SP" && s.km <= SPRING_MAX_KM) ?? null;
  const riverPool = ranked.filter((s) => s.km <= RIVER_MAX_KM && s.site_no !== spring?.site_no);
  const river = riverPool.find((s) => s.live.discharge) ?? riverPool.find((s) => s.live.level) ?? null;

  const site_names: Record<string, string> = {};
  if (spring) site_names[spring.site_no] = spring.station_nm;
  if (river) site_names[river.site_no] = river.station_nm;

  const distance = river ? river.km : spring ? spring.km : null;
  return {
    usgs_site_id: spring?.site_no ?? null,
    river_gauge_site_id: river?.site_no ?? null,
    gauge_distance_km: distance === null ? null : round1(distance),
    site_names,
  };
}
