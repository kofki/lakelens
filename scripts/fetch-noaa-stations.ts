/**
 * Find the nearest NOAA CO-OPS (Tides & Currents) station that actually returns data for every
 * park that has no USGS gauge (plus every beach / lake / river park), and write
 *   data/noaa_stations.json
 *   { [slug]: { station_id, name, distance_km, has_water_temp, has_water_level } }
 *
 *   node --experimental-strip-types scripts/fetch-noaa-stations.ts [--refresh]
 *
 * Steps
 *   1. Read data/parks.{deep,basic,extra}.json (read-only) and data/gauges.json to know which parks
 *      already have a live USGS gauge. Targets = type in (beach, lake, river) OR no USGS gauge.
 *   2. Candidate stations = the union of the NOAA metadata lists
 *        stations.json?type=watertemp   and   stations.json?type=waterlevels
 *      filtered to FL/GA/AL. NOTE: `&state=FL` on that endpoint is IGNORED (it returns all ~300),
 *      so the filter happens here. Tide-prediction-only stations (type=tidepredictions, 583 in FL)
 *      are deliberately excluded: they publish no observations, so they would never return a value.
 *   3. Each candidate within NOAA_MAX_KM is VERIFIED with live `date=latest` calls for
 *      water_temperature and water_level (datum=MLLW). Results are cached per STATION, so the
 *      ~25 Florida observation stations are checked once no matter how many parks share them.
 *   4. Pick the nearest verified station, preferring one that publishes water temperature; a
 *      level-only station is used when no temperature station is in range.
 *
 * Raw responses are cached under data/osm-cache/noaa/ and reused unless --refresh is passed.
 * No API key is needed; `application=LakeLens` identifies us. Calls are ~150 ms apart.
 */
import { join } from "node:path";

// Node's type-stripping needs the explicit .ts extension at runtime, but the root tsconfig (INFRA-owned)
// has no allowImportingTsExtensions, so a computed specifier keeps both tsc and `node` happy.
const { CACHE_DIR, DATA_DIR, REFRESH, USER_AGENT, log, readJson, sleep, writeJson }: typeof import("./fetch-lib") =
  await import("./fetch-lib" + ".ts");
const { haversineKm }: typeof import("../lib/ingest/gauges") = await import("../lib/ingest/gauges" + ".ts");
const { buildDataUrl, buildStationsUrl, extractError, isNoDataMessage, parseNoaaTime }: typeof import("../lib/ingest/noaa") =
  await import("../lib/ingest/noaa" + ".ts");

/** Coastal stations are sparse, so the radius is much wider than the USGS river-gauge one. */
export const NOAA_MAX_KM = 40;
/**
 * Fallback radius for `type='beach'` parks only. Florida has just ~25 CO-OPS observation stations,
 * so long stretches of coast (the Keys, the Panhandle, Charlotte Harbour) have nothing inside
 * 40 km. Sea-surface temperature varies slowly along a coastline, and the UI always prints the
 * station name and its distance, so a clearly-labelled regional station beats showing nothing.
 * Inland lake/river/spring parks never use this tier — a tide gauge 60 km away says nothing
 * about them.
 */
export const NOAA_BEACH_MAX_KM = 75;
const DELAY_MS = 150;
const STATES = new Set(["FL", "GA", "AL"]);
/** A latest observation older than this does not count as a working station. */
const LIVE_MAX_AGE_MS = 24 * 3600e3;

const NOAA_CACHE_DIR = join(CACHE_DIR, "noaa");
const OUT_PATH = join(DATA_DIR, "noaa_stations.json");

interface ParkLike {
  slug: string;
  name: string;
  type?: string;
  lat: number;
  lng: number;
  usgs_site_id?: string | null;
  river_gauge_site_id?: string | null;
}

interface StationMeta {
  id: string;
  name: string;
  lat: number;
  lng: number;
  state?: string;
}

interface NoaaStationEntry {
  station_id: string;
  name: string;
  distance_km: number;
  has_water_temp: boolean;
  has_water_level: boolean;
}

interface GaugeEntry {
  usgs_site_id: string | null;
  river_gauge_site_id: string | null;
}

function loadParks(): ParkLike[] {
  const out: ParkLike[] = [];
  const seen = new Set<string>();
  for (const f of ["parks.deep.json", "parks.basic.json", "parks.extra.json"]) {
    const data = readJson<{ parks: ParkLike[] }>(join(DATA_DIR, f));
    for (const p of data?.parks ?? []) {
      if (seen.has(p.slug)) continue;
      seen.add(p.slug);
      out.push(p);
    }
  }
  return out;
}

async function getJson<T>(url: string, cacheName: string): Promise<T> {
  const cachePath = join(NOAA_CACHE_DIR, cacheName);
  if (!REFRESH) {
    const cached = readJson<T>(cachePath);
    if (cached !== null) return cached;
  }
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(20000),
      });
      // NOAA puts its own error envelope in a 200 or a 400 body; both are worth caching.
      if (!res.ok && res.status !== 400) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const json = (await res.json()) as T;
      writeJson(cachePath, json);
      return json;
    } catch (err) {
      lastErr = err;
      await sleep(1500);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function loadCandidateStations(): Promise<StationMeta[]> {
  const byId = new Map<string, StationMeta>();
  for (const type of ["watertemp", "waterlevels"] as const) {
    const json = await getJson<{ stations?: StationMeta[] }>(buildStationsUrl(type), `stations-${type}.json`);
    const all = json.stations ?? [];
    let kept = 0;
    for (const s of all) {
      if (!STATES.has(String(s.state ?? ""))) continue;
      const lat = Number(s.lat);
      const lng = Number(s.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      kept++;
      if (!byId.has(s.id)) byId.set(s.id, { id: String(s.id), name: String(s.name ?? s.id), lat, lng, state: s.state });
    }
    log(`stations.json?type=${type}: ${all.length} stations nationwide, ${kept} in ${[...STATES].join("/")}`);
    await sleep(DELAY_MS);
  }
  return [...byId.values()];
}

/** Live check for ONE station, cached. `null` product result = station does not publish it. */
async function verifyStation(station: StationMeta, now: Date): Promise<{ temp: boolean; level: boolean }> {
  const out = { temp: false, level: false };
  for (const [product, key] of [
    ["water_temperature", "temp"],
    ["water_level", "level"],
  ] as const) {
    const json = await getJson<{ data?: { t: string; v: string }[]; error?: { message: string } }>(
      buildDataUrl(station.id, product),
      `latest-${station.id}-${product}.json`,
    );
    const message = extractError(json);
    if (message !== null) {
      if (!isNoDataMessage(message)) log(`  ${station.id} ${product}: ${message}`);
      continue;
    }
    const point = (json.data ?? [])[0];
    const time = point ? parseNoaaTime(point.t) : null;
    const value = point ? Number(point.v) : NaN;
    if (time && Number.isFinite(value) && now.getTime() - Date.parse(time) <= LIVE_MAX_AGE_MS) out[key] = true;
    await sleep(DELAY_MS);
  }
  return out;
}

async function main(): Promise<void> {
  const now = new Date();
  const parks = loadParks();
  const gauges = readJson<Record<string, GaugeEntry>>(join(DATA_DIR, "gauges.json")) ?? {};
  const hasGauge = (p: ParkLike) => {
    const g = gauges[p.slug];
    return Boolean(p.usgs_site_id || p.river_gauge_site_id || g?.usgs_site_id || g?.river_gauge_site_id);
  };
  const targets = parks.filter((p) => ["beach", "lake", "river"].includes(String(p.type)) || !hasGauge(p));
  log(`${parks.length} parks loaded; ${targets.length} targeted for a NOAA station (${targets.filter((p) => !hasGauge(p)).length} of them have no USGS gauge at all)`);

  const stations = await loadCandidateStations();
  log(`${stations.length} candidate observation stations`);

  // Verify only the stations that are actually within range of at least one target park.
  const radiusFor = (park: ParkLike) => (String(park.type) === "beach" ? NOAA_BEACH_MAX_KM : NOAA_MAX_KM);
  const inRange = new Set<string>();
  for (const park of targets) {
    for (const s of stations) if (haversineKm(park.lat, park.lng, s.lat, s.lng) <= radiusFor(park)) inRange.add(s.id);
  }
  log(`${inRange.size} station(s) are within range of at least one target park; verifying each with date=latest`);

  const verified = new Map<string, { temp: boolean; level: boolean }>();
  for (const s of stations) {
    if (!inRange.has(s.id)) continue;
    const v = await verifyStation(s, now);
    verified.set(s.id, v);
    log(`${s.id} ${s.name}: temp=${v.temp} level=${v.level}`);
  }

  const out: Record<string, NoaaStationEntry> = {};
  const misses: string[] = [];
  for (const park of targets) {
    const ranked = stations
      .map((s) => ({ s, km: haversineKm(park.lat, park.lng, s.lat, s.lng), v: verified.get(s.id) }))
      .filter((c) => c.km <= radiusFor(park) && c.v && (c.v.temp || c.v.level))
      .sort((a, b) => a.km - b.km);
    // prefer a station with water temperature; fall back to the nearest level-only station
    const pick = ranked.find((c) => c.v!.temp) ?? ranked[0] ?? null;
    if (!pick) {
      misses.push(park.slug);
      continue;
    }
    out[park.slug] = {
      station_id: pick.s.id,
      name: pick.s.name,
      distance_km: Math.round(pick.km * 10) / 10,
      has_water_temp: pick.v!.temp,
      has_water_level: pick.v!.level,
    };
  }

  writeJson(OUT_PATH, out);
  const withTemp = Object.values(out).filter((e) => e.has_water_temp).length;
  log(`wrote ${OUT_PATH}: ${Object.keys(out).length}/${targets.length} target parks matched a working station (${withTemp} with water temperature)`);
  const far = Object.values(out).filter((e) => e.distance_km > NOAA_MAX_KM).length;
  log(`${far} of them use the ${NOAA_BEACH_MAX_KM} km beach fallback radius`);
  if (misses.length) log(`no station in range for ${misses.length}: ${misses.join(", ")}`);
}

await main();
