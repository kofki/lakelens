/**
 * One batched Overpass query for amenity=parking within 2000 m of each DEEP park,
 * cached raw at data/osm-cache/overpass-parking.json. Seed-time only (Overpass fair use
 * is ~100 queries/day for apps): never call at request time.
 *
 *   node --experimental-strip-types scripts/fetch-overpass-parking.ts [--refresh]
 *
 * Output: { meta, parks, response (raw Overpass JSON), by_park (elements within 2 km of each slug) }.
 * DATA-deep owns data/parking_lots.json and may merge these as source='osm', unverified.
 * Verified 2026-09-19: lz4.overpass-api.de POST with a User-Agent works; overpass-api.de and
 * overpass.kumi.systems returned HTML error pages. OSM coverage at these springs is sparse (0-2 lots).
 */
import { join } from "node:path";
// Node's type-stripping needs the explicit .ts extension at runtime, but the root tsconfig (INFRA-owned)
// has no allowImportingTsExtensions, so a computed specifier keeps both tsc and `node` happy.
const { CACHE_DIR, DEEP_PARKS, USER_AGENT, cachedFetchJson, log, round, writeJson }: typeof import("./fetch-lib") = await import("./fetch-lib" + ".ts");

const ENDPOINT = "https://lz4.overpass-api.de/api/interpreter";
const RADIUS_M = 2000;
const RAW_CACHE = "overpass-parking-raw.json";
const OUT_PATH = join(CACHE_DIR, "overpass-parking.json");

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  version: number;
  generator: string;
  osm3s: { timestamp_osm_base: string; copyright: string };
  elements: OverpassElement[];
}

export function buildQuery(parks: ReadonlyArray<{ lat: number; lng: number }>, radiusM = RADIUS_M): string {
  const clauses = parks.map((p) => `nwr["amenity"="parking"](around:${radiusM},${p.lat.toFixed(5)},${p.lng.toFixed(5)});`).join("\n  ");
  return `[out:json][timeout:60];\n(\n  ${clauses}\n);\nout center;`;
}

/** Haversine in km (duplicated here so the script stays free of lib/ runtime imports). */
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function elementPoint(el: OverpassElement): { lat: number; lng: number } | null {
  if (typeof el.lat === "number" && typeof el.lon === "number") return { lat: el.lat, lng: el.lon };
  if (el.center) return { lat: el.center.lat, lng: el.center.lon };
  return null;
}

async function main(): Promise<void> {
  const query = buildQuery(DEEP_PARKS);
  const body = new URLSearchParams({ data: query });
  const { data, fromCache, cachePath } = await cachedFetchJson<OverpassResponse>(
    RAW_CACHE,
    ENDPOINT,
    {
      method: "POST",
      headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    },
    { retries: 2, retryDelayMs: 5000 },
  );
  log(`Overpass: ${data.elements?.length ?? 0} elements (${fromCache ? "cache" : "network"}; raw at ${cachePath}; osm base ${data.osm3s?.timestamp_osm_base})`);

  const byPark: Record<string, Array<{ osm_type: string; osm_id: number; lat: number; lng: number; distance_km: number; tags: Record<string, string> }>> = {};
  for (const park of DEEP_PARKS) byPark[park.slug] = [];
  for (const el of data.elements ?? []) {
    const pt = elementPoint(el);
    if (!pt) continue;
    for (const park of DEEP_PARKS) {
      const km = haversineKm(park, pt);
      if (km * 1000 <= RADIUS_M) {
        byPark[park.slug].push({ osm_type: el.type, osm_id: el.id, lat: round(pt.lat, 5), lng: round(pt.lng, 5), distance_km: round(km, 2), tags: el.tags ?? {} });
      }
    }
  }
  for (const slug of Object.keys(byPark)) byPark[slug].sort((a, b) => a.distance_km - b.distance_km);

  writeJson(OUT_PATH, {
    meta: {
      source: "OpenStreetMap via Overpass API (ODbL). Unverified community data; curated lots are primary.",
      endpoint: ENDPOINT,
      radius_m: RADIUS_M,
      query,
      fetched_at: new Date().toISOString(),
      osm_base: data.osm3s?.timestamp_osm_base ?? null,
      note: "OSM parking near these springs is sparse and carries no wheelchair/capacity:disabled tags (verified 2026-09-19).",
    },
    parks: DEEP_PARKS.map((p) => ({ slug: p.slug, lat: p.lat, lng: p.lng })),
    response: data,
    by_park: byPark,
  });
  const summary = Object.entries(byPark).map(([slug, els]) => `${slug}=${els.length}`).join(", ");
  log(`wrote ${OUT_PATH}: ${summary}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
