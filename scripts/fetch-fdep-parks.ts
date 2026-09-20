/**
 * Fetch every Florida State Park boundary polygon from FDEP's public ArcGIS layer
 * (OpenData/PARKS_BOUNDARIES, 179 features, maxRecordCount 2000) in WGS84 (outSR=4326),
 * compute a centroid per park and write data/osm-cache/fdep-parks.json.
 *
 *   node --experimental-strip-types scripts/fetch-fdep-parks.ts [--refresh]
 *
 * Idempotent: if data/osm-cache/fdep-parks.json already exists the script exits without a network call
 * unless --refresh is passed. The raw ArcGIS response (~90 MB of polygon rings) is deliberately NOT
 * persisted; the 110 KB derived file is the cache.
 * Centroid = signed-area (shoelace) centroid over all rings (ArcGIS outer rings are clockwise,
 * holes counter-clockwise, so signed sums handle multipart polygons with holes). Falls back to the
 * bbox centre for degenerate geometry. NOTE: a park centroid is NOT the swim area: basic-tier
 * parks label their coordinates accordingly.
 */
import { join } from "node:path";
// Node's type-stripping needs the explicit .ts extension at runtime, but the root tsconfig (INFRA-owned)
// has no allowImportingTsExtensions, so a computed specifier keeps both tsc and `node` happy.
const { CACHE_DIR, REFRESH, cachedFetchJson, log, readJson, round, slugify, writeJson }: typeof import("./fetch-lib") = await import("./fetch-lib" + ".ts");

const LAYER = "https://ca.dep.state.fl.us/arcgis/rest/services/OpenData/PARKS_BOUNDARIES/MapServer/0";
const OUT_FIELDS = ["UNIT_ID", "SITE_NAME", "URL", "ADDRESS", "COUNTY", "ACREAGE", "PUBLIC_ACC", "WEB_ALIAS"];
const QUERY_URL =
  `${LAYER}/query?where=1%3D1&outFields=${encodeURIComponent(OUT_FIELDS.join(","))}` +
  `&outSR=4326&returnGeometry=true&geometryPrecision=6&f=json`;
const OUT_PATH = join(CACHE_DIR, "fdep-parks.json");

type Ring = number[][]; // [[lng, lat], ...]

interface ArcFeature {
  attributes: Record<string, string | number | null>;
  geometry?: { rings?: Ring[] };
}

interface ArcResponse {
  features: ArcFeature[];
  exceededTransferLimit?: boolean;
  error?: { code: number; message: string };
}

export interface FdepPark {
  unit_id: string | null;
  site_name: string;
  /** Path slug taken from the floridastateparks.org URL, e.g. "avalon-state-park"; null when no URL. */
  slug: string | null;
  /** kebab-case of SITE_NAME as a secondary join key */
  name_slug: string;
  url: string | null;
  address: string | null;
  county: string | null;
  acreage: number | null;
  lat: number;
  lng: number;
  centroid_method: "shoelace" | "bbox";
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  ring_count: number;
}

/** Signed shoelace area and centroid of one ring (x = lng, y = lat). */
function ringAreaCentroid(ring: Ring): { area: number; cx: number; cy: number } {
  let area = 0;
  let cx = 0;
  let cy = 0;
  const n = ring.length;
  if (n < 3) return { area: 0, cx: 0, cy: 0 };
  for (let i = 0; i < n; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % n];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-12) return { area: 0, cx: 0, cy: 0 };
  return { area, cx: cx / (6 * area), cy: cy / (6 * area) };
}

export function polygonCentroid(rings: Ring[]): { lat: number; lng: number; method: "shoelace" | "bbox"; bbox: [number, number, number, number] } {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  let sumArea = 0, sumCx = 0, sumCy = 0;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minLng) minLng = x;
      if (x > maxLng) maxLng = x;
      if (y < minLat) minLat = y;
      if (y > maxLat) maxLat = y;
    }
    const { area, cx, cy } = ringAreaCentroid(ring);
    sumArea += area;
    sumCx += cx * area;
    sumCy += cy * area;
  }
  const bbox: [number, number, number, number] = [minLng, minLat, maxLng, maxLat];
  if (Math.abs(sumArea) > 1e-12 && Number.isFinite(sumCx / sumArea)) {
    const lng = sumCx / sumArea;
    const lat = sumCy / sumArea;
    // Sanity: centroid should sit inside the bbox; otherwise fall back.
    if (lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat) {
      return { lat, lng, method: "shoelace", bbox };
    }
  }
  return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2, method: "bbox", bbox };
}

/** "https://www.floridastateparks.org/parks-and-trails/avalon-state-park" -> "avalon-state-park" */
export function slugFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    return last ? last.toLowerCase() : null;
  } catch {
    const m = url.match(/parks-and-trails\/([a-z0-9-]+)/i);
    return m ? m[1].toLowerCase() : null;
  }
}

function str(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

async function main(): Promise<void> {
  const existing = readJson<{ count: number }>(OUT_PATH);
  if (existing && !REFRESH) {
    log(`FDEP: ${OUT_PATH} already has ${existing.count} parks; skipping network (pass --refresh to re-query)`);
    return;
  }
  const { data } = await cachedFetchJson<ArcResponse>("fdep-parks-raw.json", QUERY_URL, {}, { refresh: true, persist: false });
  if (data.error) throw new Error(`ArcGIS error ${data.error.code}: ${data.error.message}`);
  log(`FDEP PARKS_BOUNDARIES: ${data.features.length} features (network; raw response not persisted)`);
  if (data.exceededTransferLimit) console.warn("[fdep] exceededTransferLimit=true: layer returned a partial page");

  const parks: FdepPark[] = [];
  let bboxFallbacks = 0;
  for (const f of data.features) {
    const rings = f.geometry?.rings ?? [];
    if (!rings.length) {
      console.warn(`[fdep] no geometry for ${f.attributes.SITE_NAME}`);
      continue;
    }
    const c = polygonCentroid(rings);
    if (c.method === "bbox") bboxFallbacks++;
    const siteName = str(f.attributes.SITE_NAME) ?? "";
    const url = str(f.attributes.URL);
    parks.push({
      unit_id: str(f.attributes.UNIT_ID),
      site_name: siteName,
      slug: slugFromUrl(url),
      name_slug: slugify(siteName),
      url,
      address: str(f.attributes.ADDRESS),
      county: str(f.attributes.COUNTY),
      acreage: typeof f.attributes.ACREAGE === "number" ? round(f.attributes.ACREAGE, 1) : null,
      lat: round(c.lat, 5),
      lng: round(c.lng, 5),
      centroid_method: c.method,
      bbox: c.bbox.map((v) => round(v, 5)) as [number, number, number, number],
      ring_count: rings.length,
    });
  }
  parks.sort((a, b) => a.site_name.localeCompare(b.site_name));

  writeJson(OUT_PATH, {
    meta: {
      source: "FDEP OpenData PARKS_BOUNDARIES (ArcGIS REST), WGS84 centroids computed by scripts/fetch-fdep-parks.ts",
      layer: LAYER,
      query: QUERY_URL,
      fetched_at: new Date().toISOString(),
      note: "lat/lng is the park boundary centroid, not the swim area.",
    },
    count: parks.length,
    parks,
  });
  log(`wrote ${OUT_PATH}: ${parks.length} parks (${bboxFallbacks} bbox fallbacks, ${parks.filter((p) => p.slug).length} with URL slugs)`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
