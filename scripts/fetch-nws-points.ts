/**
 * Resolve the NWS /points metadata (forecast office grid, forecast URLs, forecast zone FLZxxx and
 * county FLCxxx) for every park in data/parks.basic.json AND the 7 deep-tier parks, then write:
 *   - nws_grid / nws_zone / nws_county back into data/parks.basic.json (in place, other fields untouched)
 *   - data/osm-cache/nws-points-deep.json keyed by slug for DATA-deep (parks.deep.json is theirs)
 *
 *   node --experimental-strip-types scripts/fetch-nws-points.ts [--refresh]
 *
 *   - data/osm-cache/nws-points-basic.json keyed by slug (provenance; read by fetch-fsp-swimming-parks.ts)
 *
 * Verified 2026-09-19: api.weather.gov returns 403 without a User-Agent and 301 when /points gets
 * more than 4 decimals, so coordinates are rounded to 4 dp and redirects are followed. Responses are
 * cached per rounded coordinate under data/osm-cache/nws-points/<lat>_<lng>.json (cache-control on
 * /points is 24 h upstream; grid ids are stable). Network calls are spaced 200 ms apart.
 *
 * Coastal parks: a boundary centroid that falls in the water (barrier islands, inlets, the Keys) makes
 * NWS answer with a MARINE zone (GMZ/AMZ) and no county, which would break county/zone alert matching.
 * For those, the script probes 8 compass points at ~1, 2 and 3 km from the centroid and keeps the
 * first LAND result (FLZ zone + FLC county), recording the probe point as provenance.
 * Failures never abort the run: the park keeps null NWS fields and is listed at the end.
 */
import { join } from "node:path";
import type { NwsGrid } from "../lib/types";
import type { ParkSeed } from "./fetch-fsp-swimming-parks";
// Node's type-stripping needs the explicit .ts extension at runtime, but the root tsconfig (INFRA-owned)
// has no allowImportingTsExtensions, so a computed specifier keeps both tsc and `node` happy.
const { CACHE_DIR, DATA_DIR, DEEP_PARKS, USER_AGENT, cachedFetchJson, log, readJson, sleep, writeJson }: typeof import("./fetch-lib") = await import("./fetch-lib" + ".ts");

const BASIC_PATH = join(DATA_DIR, "parks.basic.json");
const DEEP_OUT = join(CACHE_DIR, "nws-points-deep.json");
const BASIC_OUT = join(CACHE_DIR, "nws-points-basic.json");
const DELAY_MS = 200;
/** Probe rings (degrees, ~1.1 km each) and the 8 compass directions used when the centroid is offshore. */
const PROBE_STEPS_DEG = [0.01, 0.02, 0.03];
const PROBE_DIRS: ReadonlyArray<[number, number]> = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

interface NwsPointsResponse {
  properties: {
    gridId: string;
    gridX: number;
    gridY: number;
    forecast: string;
    forecastHourly: string;
    forecastGridData?: string;
    forecastZone: string; // "https://api.weather.gov/zones/forecast/FLZ021"
    county: string; // "https://api.weather.gov/zones/county/FLC121"
    timeZone?: string;
    radarStation?: string;
  };
}

export interface NwsPointResult {
  nws_grid: NwsGrid;
  nws_zone: string | null;
  nws_county: string | null;
  time_zone: string | null;
  radar_station: string | null;
}

/** One park's resolved record as written to the sidecar files. */
export interface NwsPointRecord extends NwsPointResult {
  lat: number;
  lng: number;
  points_url: string;
  fetched_at: string;
  /** Set when the centroid returned a marine zone and a nearby land point was used instead. */
  probe: { lat: number; lng: number; offset_km: number; centroid_zone: string | null } | null;
}

export function isLandResult(r: NwsPointResult): boolean {
  return /^FLZ\d{3}$/.test(r.nws_zone ?? "") && /^FLC\d{3}$/.test(r.nws_county ?? "");
}

function zoneCode(url: string | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/([A-Z]{2}[CZ]\d{3})$/);
  return m ? m[1] : null;
}

export function pointsUrl(lat: number, lng: number): string {
  return `https://api.weather.gov/points/${lat.toFixed(4)},${lng.toFixed(4)}`;
}

export function parsePoints(res: NwsPointsResponse): NwsPointResult {
  const p = res.properties;
  return {
    nws_grid: { gridId: p.gridId, gridX: p.gridX, gridY: p.gridY, forecast: p.forecast, forecastHourly: p.forecastHourly },
    nws_zone: zoneCode(p.forecastZone),
    nws_county: zoneCode(p.county),
    time_zone: p.timeZone ?? null,
    radar_station: p.radarStation ?? null,
  };
}

async function resolvePoint(lat: number, lng: number): Promise<{ result: NwsPointResult; fromCache: boolean }> {
  const cacheName = `nws-points/${lat.toFixed(4)}_${lng.toFixed(4)}.json`;
  const { data, fromCache } = await cachedFetchJson<NwsPointsResponse>(
    cacheName,
    pointsUrl(lat, lng),
    { headers: { "User-Agent": USER_AGENT, Accept: "application/geo+json" } },
    { retries: 2, retryDelayMs: 5000 },
  );
  if (!data?.properties?.gridId) throw new Error("unexpected /points payload (no properties.gridId)");
  return { result: parsePoints(data), fromCache };
}

/** Resolve a park: centroid first; if NWS says "marine", walk outward until a land zone answers. */
async function resolvePark(t: { slug: string; lat: number; lng: number }, counters: { network: number }): Promise<NwsPointRecord> {
  const first = await resolvePoint(t.lat, t.lng);
  if (!first.fromCache) {
    counters.network++;
    await sleep(DELAY_MS);
  }
  const base = { lat: t.lat, lng: t.lng, points_url: pointsUrl(t.lat, t.lng), fetched_at: new Date().toISOString() };
  if (isLandResult(first.result)) return { ...base, ...first.result, probe: null };

  const centroidZone = first.result.nws_zone;
  for (const step of PROBE_STEPS_DEG) {
    for (const [dy, dx] of PROBE_DIRS) {
      const lat = t.lat + dy * step;
      const lng = t.lng + dx * step;
      try {
        const probe = await resolvePoint(lat, lng);
        if (!probe.fromCache) {
          counters.network++;
          await sleep(DELAY_MS);
        }
        if (isLandResult(probe.result)) {
          const offsetKm = Math.round(Math.hypot(dy * step * 111.2, dx * step * 111.2 * Math.cos((t.lat * Math.PI) / 180)) * 10) / 10;
          log(`  ${t.slug}: centroid is offshore (${centroidZone}); using land point ${lat.toFixed(4)},${lng.toFixed(4)} (~${offsetKm} km) -> ${probe.result.nws_zone}/${probe.result.nws_county}`);
          return { ...base, ...probe.result, probe: { lat: Number(lat.toFixed(4)), lng: Number(lng.toFixed(4)), offset_km: offsetKm, centroid_zone: centroidZone } };
        }
      } catch (err) {
        console.warn(`[nws] probe ${lat.toFixed(4)},${lng.toFixed(4)} for ${t.slug} failed: ${(err as Error).message}`);
      }
    }
  }
  console.warn(`[nws] ${t.slug}: no land zone within ~3 km of the centroid; keeping marine zone ${centroidZone}`);
  return { ...base, ...first.result, probe: null };
}

async function main(): Promise<void> {
  const basicFile = readJson<{ meta?: Record<string, unknown>; parks: ParkSeed[] }>(BASIC_PATH);
  if (!basicFile) throw new Error(`Missing ${BASIC_PATH} — run scripts/fetch-fsp-swimming-parks.ts first.`);

  const targets: Array<{ slug: string; lat: number; lng: number; tier: "basic" | "deep" }> = [
    ...basicFile.parks.map((p) => ({ slug: p.slug, lat: p.lat, lng: p.lng, tier: "basic" as const })),
    ...DEEP_PARKS.map((p) => ({ slug: p.slug, lat: p.lat, lng: p.lng, tier: "deep" as const })),
  ];
  log(`resolving NWS /points for ${targets.length} parks (${basicFile.parks.length} basic + ${DEEP_PARKS.length} deep)`);

  const results = new Map<string, NwsPointRecord>();
  const failures: string[] = [];
  const counters = { network: 0 };
  for (const t of targets) {
    try {
      results.set(t.slug, await resolvePark(t, counters));
    } catch (err) {
      failures.push(`${t.slug}: ${(err as Error).message}`);
      console.warn(`[nws] ${t.slug} failed: ${(err as Error).message}`);
    }
  }

  // Write back into parks.basic.json in place (only the three NWS fields change).
  let updated = 0;
  for (const p of basicFile.parks) {
    const r = results.get(p.slug);
    if (!r) continue;
    p.nws_grid = r.nws_grid;
    p.nws_zone = r.nws_zone;
    p.nws_county = r.nws_county;
    updated++;
  }
  basicFile.meta = { ...(basicFile.meta ?? {}), nws_points_resolved_at: new Date().toISOString(), nws_points_source: "https://api.weather.gov/points/{lat},{lng}" };
  writeJson(BASIC_PATH, basicFile);

  const basic: Record<string, NwsPointRecord> = {};
  for (const p of basicFile.parks) {
    const r = results.get(p.slug);
    if (r) basic[p.slug] = r;
  }
  writeJson(BASIC_OUT, {
    meta: {
      source: "NWS api.weather.gov /points (User-Agent required; coords rounded to 4 dp; offshore centroids probed to the nearest land zone)",
      generated_by: "scripts/fetch-nws-points.ts",
      generated_at: new Date().toISOString(),
      note: "Keyed by basic-tier slug. scripts/fetch-fsp-swimming-parks.ts reads this to fill nws_* fields and provenance on rebuild.",
    },
    parks: basic,
  });

  const deep: Record<string, NwsPointRecord> = {};
  for (const d of DEEP_PARKS) {
    const r = results.get(d.slug);
    if (r) deep[d.slug] = r;
  }
  writeJson(DEEP_OUT, {
    meta: {
      source: "NWS api.weather.gov /points (User-Agent required; coords rounded to 4 dp)",
      generated_by: "scripts/fetch-nws-points.ts",
      generated_at: new Date().toISOString(),
      note: "Keyed by deep-tier slug. DATA-deep copies nws_grid/nws_zone/nws_county into data/parks.deep.json.",
    },
    parks: deep,
  });

  const probed = [...results.values()].filter((r) => r.probe).length;
  const marine = [...results.values()].filter((r) => !isLandResult(r)).length;
  log(`wrote ${BASIC_PATH}: ${updated}/${basicFile.parks.length} basic parks with NWS grid (${counters.network} network calls; ${probed} resolved via land probe; ${marine} still marine)`);
  log(`wrote ${BASIC_OUT}: ${Object.keys(basic).length} basic parks; ${DEEP_OUT}: ${Object.keys(deep).length}/${DEEP_PARKS.length} deep parks`);
  if (failures.length) console.warn(`[nws] ${failures.length} failures:\n  - ${failures.join("\n  - ")}`);
  if (results.size === 0) {
    console.error("[nws] no /points lookups succeeded");
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
