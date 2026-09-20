/**
 * Named lakes you can actually get to, harvested by public land rather than by beach tag.
 *
 *   node --experimental-strip-types scripts/fetch-osm-public-lakes.ts [STATE ...] [--budget=N]
 *
 * Adds to data/parks.osm.json. Run the water check afterwards as with any other harvest.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every earlier harvest asked OSM for a tag that means "people swim here": natural=beach,
 * leisure=swimming_area, natural=spring, a slipway, a marina. That finds swim spots where
 * somebody has drawn one, and it is blind to the far more common case of a lake with a
 * public shore and no such tag. Florida, a state named for its water, came out with 66
 * parks and none in Lakeland.
 *
 * Lake Wauburg is the example that makes the failure concrete. It has a University of
 * Florida recreation area on its north shore and a state park on its south, and OSM tags it
 * `natural=water` + `water=lake` and nothing else. No beach, no swimming area. Invisible.
 *
 * WHY ADJACENCY AND NOT CONTAINMENT
 * ---------------------------------
 * The obvious query is "named lakes inside a park boundary", and it was tried: it returns
 * 467 lakes in Florida and still misses Lake Wauburg, because the lake sits BETWEEN the two
 * public parcels and is cut out of both. Park polygons routinely exclude their own water.
 * So the test is whether the lake touches public land, not whether it sits inside it.
 *
 * WHY THE MATCHING HAPPENS HERE
 * -----------------------------
 * Asking Overpass for lakes near a set of areas is an expensive query per state. Every
 * named lake in every state is already cached with its bounding box for the water check, so
 * the only thing missing is the public land, and the overlap test is local and free.
 */
import { join } from "node:path";

const {
  CACHE_DIR,
  DATA_DIR,
  REFRESH,
  USER_AGENT,
  createDeadline,
  log,
  readJson,
  requestTimeout,
  sleep,
  writeJson,
}: typeof import("./fetch-lib") = await import("./fetch-lib" + ".ts");

const OUT_PATH = join(DATA_DIR, "parks.osm.json");
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const GAP_MS = 8_000;
const SERVER_TIMEOUT_S = 180;
/** A statewide area query, same class as the water one, so the same longer wait. */
const STATE_QUERY_TIMEOUT_MS = 150_000;

const deadline = createDeadline();

/**
 * How close a lake has to be to public land.
 *
 * 250 m, because a park boundary and the water it borders are drawn by different people
 * from different sources and rarely meet exactly. Tighter than this and Lake Wauburg falls
 * back out; much wider and a lake across the road from a playground qualifies.
 */
export const ADJACENCY_M = 250;
const M_PER_DEG_LAT = 111_320;

/**
 * Public land, as bounding boxes.
 *
 * recreation_ground is in the list because that is what a university lake front or a county
 * swimming area is often tagged, and those are exactly the places this is looking for.
 */
export function buildPublicLandQuery(state: string): string {
  const kinds = [
    ['"leisure"="park"'],
    ['"leisure"="nature_reserve"'],
    ['"leisure"="recreation_ground"'],
    ['"boundary"="protected_area"'],
    ['"boundary"="national_park"'],
  ];
  const clauses = kinds.flatMap(([tag]) => [`  way[${tag}](area.a);`, `  relation[${tag}](area.a);`]);
  return [
    `[out:json][timeout:${SERVER_TIMEOUT_S}];`,
    `area["ISO3166-2"="US-${state}"][admin_level=4]->.a;`,
    "(",
    ...clauses,
    ");",
    "out ids tags bb;",
  ].join("\n");
}

export type Box = [south: number, west: number, north: number, east: number];

interface OverpassElement {
  type: string;
  id: number;
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
  tags?: Record<string, string>;
}

export function parseBoxes(elements: OverpassElement[]): Box[] {
  const out: Box[] = [];
  for (const el of elements ?? []) {
    if (!el.bounds) continue;
    out.push([el.bounds.minlat, el.bounds.minlon, el.bounds.maxlat, el.bounds.maxlon]);
  }
  return out;
}

/** True when two boxes come within `padM` of each other. */
export function boxesTouch(a: Box, b: Box, padM = ADJACENCY_M): boolean {
  const padLat = padM / M_PER_DEG_LAT;
  const midLat = (a[0] + a[2]) / 2;
  const padLon = padLat / Math.max(Math.cos((midLat * Math.PI) / 180), 0.2);
  // Separating-axis: they miss only if one is entirely past the other on some side.
  if (a[2] + padLat < b[0] || b[2] + padLat < a[0]) return false;
  if (a[3] + padLon < b[1] || b[3] + padLon < a[1]) return false;
  return true;
}

/** Box centre, which is where the park pin goes. */
export function boxCentre(box: Box): { lat: number; lng: number } {
  return { lat: (box[0] + box[2]) / 2, lng: (box[1] + box[3]) / 2 };
}

/**
 * Lakes big enough to be a destination.
 *
 * A retention pond behind a playground is technically a named lake beside public land. This
 * is roughly 1.5 hectares, which keeps real swimming lakes and drops the drainage.
 */
export const MIN_LAKE_DEG2 = 1.2e-6;

export function boxArea(box: Box): number {
  return Math.max(box[2] - box[0], 0) * Math.max(box[3] - box[1], 0);
}

export function kebab(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

interface WaterFeature {
  name: string;
  kind: string;
  bbox: Box;
}

interface OsmPark {
  slug: string;
  name: string;
  type: "lake";
  state: string;
  operator: "county";
  lat: number;
  lng: number;
  coverage_tier: "basic";
  swimming_verified: boolean;
  guarded: "unknown";
  hours: null;
  fees: null;
  reservation_required: boolean;
  reservation_url: null;
  rules: Record<string, never>;
  usgs_site_id: null;
  river_gauge_site_id: null;
  gauge_distance_km: null;
  nws_grid: null;
  nws_zone: null;
  nws_county: null;
  typical_closure_time: null;
  cavern_warning: boolean;
  safety_notes: null;
  official_url: null;
  photo_url: null;
  entrance_notes: null;
  swim_season: null;
  description: null;
  sources: string[];
  osm_ref: string;
}

/**
 * Lakes touching public land, as park rows.
 *
 * Pure, so the matching can be tested without the network. `taken` are slugs already in the
 * file: a lake that is already represented by a beach on its shore is not added again.
 */
export function lakesNearPublicLand(
  lakes: WaterFeature[],
  publicLand: Box[],
  state: string,
  taken: ReadonlySet<string>,
): OsmPark[] {
  const out: OsmPark[] = [];
  const seen = new Set<string>();
  for (const lake of lakes) {
    if (lake.kind !== "lake" || !lake.name.trim()) continue;
    if (boxArea(lake.bbox) < MIN_LAKE_DEG2) continue;
    if (!publicLand.some((box) => boxesTouch(lake.bbox, box))) continue;

    const slug = `${kebab(lake.name)}-${state.toLowerCase()}`;
    if (!slug || seen.has(slug) || taken.has(slug)) continue;
    seen.add(slug);
    const at = boxCentre(lake.bbox);
    out.push({
      slug,
      name: lake.name,
      type: "lake",
      state,
      // Nobody has said who runs it. County is what most public lake access actually is.
      operator: "county",
      lat: Math.round(at.lat * 1e5) / 1e5,
      lng: Math.round(at.lng * 1e5) / 1e5,
      coverage_tier: "basic",
      // The strongest claim here is "there is public land on the shore", which is not the
      // same as "you may swim". The UI says so.
      swimming_verified: false,
      guarded: "unknown",
      hours: null,
      fees: null,
      reservation_required: false,
      reservation_url: null,
      rules: {},
      usgs_site_id: null,
      river_gauge_site_id: null,
      gauge_distance_km: null,
      nws_grid: null,
      nws_zone: null,
      nws_county: null,
      typical_closure_time: null,
      cavern_warning: false,
      safety_notes: null,
      official_url: null,
      photo_url: null,
      entrance_notes: null,
      swim_season: null,
      description: null,
      sources: ["https://www.openstreetmap.org/"],
      osm_ref: `lake/${slug}`,
    });
  }
  return out;
}

async function post(query: string): Promise<OverpassElement[]> {
  const body = new URLSearchParams({ data: query }).toString();
  let lastError = "network error";
  for (const endpoint of ENDPOINTS) {
    if (deadline.expired()) throw new Error(`out of time after ${deadline.elapsedMin()} min (${lastError})`);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        body,
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(requestTimeout(deadline, STATE_QUERY_TIMEOUT_MS)),
      });
      if (res.ok) return ((await res.json()) as { elements?: OverpassElement[] }).elements ?? [];
      lastError = `HTTP ${res.status}`;
      if (res.status === 406 || res.status === 429) await sleep(GAP_MS * 3);
    } catch (err) {
      lastError = (err as Error).message;
    }
  }
  throw new Error(`Overpass refused the query (${lastError})`);
}

async function fetchPublicLand(state: string): Promise<Box[]> {
  const cachePath = join(CACHE_DIR, `osm-publicland-${state}.json`);
  if (!REFRESH) {
    const cached = readJson<{ boxes: Box[] }>(cachePath);
    if (cached?.boxes) {
      log(`${state}: ${cached.boxes.length} public-land areas (cache)`);
      return cached.boxes;
    }
  }
  const boxes = parseBoxes(await post(buildPublicLandQuery(state)));
  writeJson(cachePath, { boxes });
  log(`${state}: ${boxes.length} public-land areas (network)`);
  return boxes;
}

/** Named lakes for a state, from whichever water-check cache exists. */
function cachedLakes(state: string): WaterFeature[] {
  for (const suffix of ["", "-coast"]) {
    const cached = readJson<{ features: WaterFeature[] }>(join(CACHE_DIR, `osm-water-${state}${suffix}.json`));
    if (cached?.features) return cached.features.filter((f) => f.kind === "lake");
  }
  return [];
}

async function main(): Promise<void> {
  const states = process.argv.slice(2).filter((a) => /^[A-Z]{2}$/.test(a));
  const existing = readJson<{ parks: OsmPark[]; states?: string[] }>(OUT_PATH);
  if (!existing?.parks) throw new Error(`no parks in ${OUT_PATH}; run fetch-osm-swim-areas.ts first`);

  const bySlug = new Map(existing.parks.map((p) => [p.slug, p]));
  const targets = states.length > 0 ? states : [...new Set(existing.parks.map((p) => p.state))].sort();
  log(`${targets.length} state(s) to check for lakes beside public land`);

  let added = 0;
  const failed: string[] = [];
  for (const state of targets) {
    if (deadline.expired()) {
      log(`out of time after ${deadline.elapsedMin()} min; stopping at ${state}`);
      break;
    }
    const lakes = cachedLakes(state);
    if (lakes.length === 0) {
      log(`${state}: no cached lakes; run fetch-osm-water-bodies.ts for it first`);
      continue;
    }
    let publicLand: Box[];
    try {
      publicLand = await fetchPublicLand(state);
    } catch (err) {
      failed.push(state);
      log(`${state} failed: ${(err as Error).message}`);
      await sleep(GAP_MS);
      continue;
    }
    const found = lakesNearPublicLand(lakes, publicLand, state, new Set(bySlug.keys()));
    for (const park of found) bySlug.set(park.slug, park);
    added += found.length;
    log(`${state}: ${found.length} lakes beside public land (${lakes.length} named lakes seen)`);
    writeJson(OUT_PATH, {
      ...existing,
      generated_at: new Date().toISOString(),
      parks: [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug)),
    });
    await sleep(GAP_MS);
  }

  log(`added ${added} lakes; ${bySlug.size} parks in ${OUT_PATH}`);
  if (failed.length) log(`  states with no answer: ${failed.join(", ")}`);
  log("run fetch-osm-water-bodies.ts next: nothing is published until it confirms the water");
}

// Guarded: importing this module for its exported helpers must not start a harvest.
if (import.meta.url === `file://${process.argv[1]}`) await main();
