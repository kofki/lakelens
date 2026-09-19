/**
 * Find the nearest LIVE USGS gauges for every park that has none in its JSON, and write
 * data/gauges.json  { [slug]: { usgs_site_id, river_gauge_site_id, gauge_distance_km, site_names } }
 * (DATA-deep's build-seed.ts merges the first three fields into parks by slug; site_names is provenance.)
 *
 *   node --experimental-strip-types scripts/fetch-usgs-sites.ts [--refresh]
 *
 * Steps
 *   1. Read data/parks.basic.json + data/parks.deep.json (+ data/parks.extra.json if present).
 *      Parks that already carry usgs_site_id or river_gauge_site_id are skipped.
 *   2. Per park: USGS Site Service, RDB, bbox +-0.15 deg, siteType SP,ST, active, has IV data.
 *      Raw responses are cached under data/osm-cache/usgs-sites/<slug>.rdb; network calls 200 ms apart.
 *   3. Verify candidates have a CURRENT (<= 24 h) 00060 discharge or 00065 gage-height reading:
 *      one OGC latest-continuous request per 40 sites (the modern instantaneous-values endpoint;
 *      legacy WaterServices IV JSON is the fallback when OGC fails).
 *   4. lib/ingest/gauges.ts selectGauges(): spring gauge <= 1 km, river gauge <= 15 km (discharge preferred).
 *
 * Uses USGS_API_KEY from the environment or .env.local when present (higher OGC rate limit); never prints it.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { GaugeSelection, SiteLiveness, UsgsSiteRecord } from "../lib/ingest/gauges";

// Node's type-stripping needs the explicit .ts extension at runtime, but the root tsconfig (INFRA-owned)
// has no allowImportingTsExtensions, so a computed specifier keeps both tsc and `node` happy.
const { CACHE_DIR, DATA_DIR, REFRESH, ROOT, USER_AGENT, ensureDir, log, readJson, sleep, writeJson }: typeof import("./fetch-lib") =
  await import("./fetch-lib" + ".ts");
const { RIVER_MAX_KM, haversineKm, isLiveReading, parseRdbSites, selectGauges, usgsSitesUrl }: typeof import("../lib/ingest/gauges") =
  await import("../lib/ingest/gauges" + ".ts");

const SITES_CACHE_DIR = join(CACHE_DIR, "usgs-sites");
const OUT_PATH = join(DATA_DIR, "gauges.json");
const DELAY_MS = 200;
const CHUNK = 40;
const OGC_LATEST_URL = "https://api.waterdata.usgs.gov/ogcapi/v1/collections/latest-continuous/items";
const LEGACY_IV_URL = "https://waterservices.usgs.gov/nwis/iv/";

interface ParkLike {
  slug: string;
  name: string;
  lat: number;
  lng: number;
  usgs_site_id?: string | null;
  river_gauge_site_id?: string | null;
}

function readEnvKey(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const envPath = join(ROOT, ".env.local");
  if (!existsSync(envPath)) return undefined;
  const m = readFileSync(envPath, "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined;
}

function loadParks(): ParkLike[] {
  const files = ["parks.deep.json", "parks.basic.json", "parks.extra.json"];
  const out: ParkLike[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    const data = readJson<{ parks: ParkLike[] }>(join(DATA_DIR, f));
    if (!data?.parks) continue;
    for (const p of data.parks) {
      if (seen.has(p.slug)) continue;
      seen.add(p.slug);
      out.push(p);
    }
  }
  return out;
}

async function fetchSitesRdb(park: ParkLike): Promise<{ text: string; fromCache: boolean }> {
  ensureDir(SITES_CACHE_DIR);
  const cachePath = join(SITES_CACHE_DIR, `${park.slug}.rdb`);
  if (!REFRESH && existsSync(cachePath)) return { text: readFileSync(cachePath, "utf8"), fromCache: true };
  const url = usgsSitesUrl(park.lat, park.lng);
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20000) });
      // 404 = "no sites match" for this service; treat as an empty table.
      if (res.status === 404) {
        writeFileSync(cachePath, "# no sites\n", "utf8");
        return { text: "", fromCache: false };
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const text = await res.text();
      writeFileSync(cachePath, text, "utf8");
      return { text, fromCache: false };
    } catch (err) {
      lastErr = err;
      await sleep(2000);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

interface OgcFeature {
  properties: { monitoring_location_id: string; parameter_code: string; time: string; value: string | number | null };
}

/** site_no -> liveness from one batch of <= 40 sites (OGC first, legacy IV fallback). */
async function fetchLiveness(siteIds: string[], apiKey: string | undefined, now: Date): Promise<Record<string, SiteLiveness>> {
  const out: Record<string, SiteLiveness> = {};
  const mark = (site: string, parameter: string, time: string, value: unknown) => {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return;
    if (!isLiveReading(time, now)) return;
    const s = site.replace(/^USGS-/i, "");
    const cur = (out[s] ??= { discharge: false, level: false });
    if (parameter === "00060") cur.discharge = true;
    if (parameter === "00065") cur.level = true;
  };
  try {
    const params = new URLSearchParams({
      f: "json",
      monitoring_location_id: siteIds.map((s) => `USGS-${s}`).join(","),
      parameter_code: "00060,00065",
      limit: "500",
    });
    const headers: Record<string, string> = { Accept: "application/json", "User-Agent": USER_AGENT };
    if (apiKey) headers["X-Api-Key"] = apiKey;
    const res = await fetch(`${OGC_LATEST_URL}?${params}`, { headers, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`OGC HTTP ${res.status}`);
    const json = (await res.json()) as { features?: OgcFeature[] };
    for (const f of json.features ?? []) mark(f.properties.monitoring_location_id, f.properties.parameter_code, f.properties.time, f.properties.value);
    return out;
  } catch (err) {
    log(`OGC latest-continuous failed for a chunk (${(err as Error).message}); trying legacy IV`);
  }
  const params = new URLSearchParams({ format: "json", sites: siteIds.join(","), parameterCd: "00060,00065", siteStatus: "all" });
  const res = await fetch(`${LEGACY_IV_URL}?${params}`, { headers: { Accept: "application/json", "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`legacy IV HTTP ${res.status}`);
  const json = (await res.json()) as {
    value: { timeSeries: { sourceInfo: { siteCode: { value: string }[] }; variable: { variableCode: { value: string }[]; noDataValue?: number }; values: { value: { value: string; dateTime: string }[] }[] }[] };
  };
  for (const ts of json.value?.timeSeries ?? []) {
    const site = ts.sourceInfo?.siteCode?.[0]?.value;
    const parameter = ts.variable?.variableCode?.[0]?.value;
    const noData = ts.variable?.noDataValue ?? -999999;
    for (const m of ts.values ?? []) for (const v of m.value ?? []) if (Number(v.value) !== noData) mark(site, parameter, v.dateTime, v.value);
  }
  return out;
}

async function main(): Promise<void> {
  const now = new Date();
  const apiKey = readEnvKey("USGS_API_KEY");
  const parks = loadParks();
  const todo = parks.filter((p) => !p.usgs_site_id && !p.river_gauge_site_id);
  log(`${parks.length} parks loaded; ${parks.length - todo.length} already have a gauge; resolving ${todo.length}`);

  // 1. candidate sites per park (site service, cached)
  const candidates = new Map<string, UsgsSiteRecord[]>();
  const failed: string[] = [];
  for (const park of todo) {
    try {
      const { text, fromCache } = await fetchSitesRdb(park);
      const sites = parseRdbSites(text).filter((s) => haversineKm(park.lat, park.lng, s.lat, s.lng) <= RIVER_MAX_KM);
      candidates.set(park.slug, sites);
      log(`${park.slug}: ${sites.length} candidate site(s) within ${RIVER_MAX_KM} km${fromCache ? " (cache)" : ""}`);
      if (!fromCache) await sleep(DELAY_MS);
    } catch (err) {
      failed.push(park.slug);
      log(`${park.slug}: site service failed: ${(err as Error).message}`);
    }
  }

  // 2. liveness for every distinct candidate, 40 sites per request
  const allIds = [...new Set([...candidates.values()].flat().map((s) => s.site_no))];
  const live: Record<string, SiteLiveness> = {};
  for (let i = 0; i < allIds.length; i += CHUNK) {
    const chunk = allIds.slice(i, i + CHUNK);
    try {
      Object.assign(live, await fetchLiveness(chunk, apiKey, now));
    } catch (err) {
      log(`liveness check failed for ${chunk.length} sites: ${(err as Error).message}`);
    }
    await sleep(DELAY_MS);
  }
  const liveCount = Object.values(live).filter((l) => l.discharge || l.level).length;
  log(`${allIds.length} distinct candidate sites; ${liveCount} have a reading <= 24 h old`);

  // 3. select + write
  const out: Record<string, GaugeSelection> = {};
  let withRiver = 0;
  let withSpring = 0;
  for (const park of todo) {
    const sel = selectGauges(park, candidates.get(park.slug) ?? [], live);
    out[park.slug] = sel;
    if (sel.usgs_site_id) withSpring++;
    if (sel.river_gauge_site_id) withRiver++;
  }
  writeJson(OUT_PATH, out);
  const gained = Object.values(out).filter((g) => g.usgs_site_id || g.river_gauge_site_id).length;
  log(`wrote ${OUT_PATH}: ${Object.keys(out).length} parks, ${gained} gained a gauge (${withSpring} spring, ${withRiver} river)`);
  if (failed.length) log(`site service failed for: ${failed.join(", ")}`);
}

await main();
