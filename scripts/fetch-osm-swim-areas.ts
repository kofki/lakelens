/**
 * Harvest freshwater swim areas from OpenStreetMap, state by state.
 *
 *   node --experimental-strip-types scripts/fetch-osm-swim-areas.ts [STATE ...] [--refresh]
 *
 * Writes data/parks.osm.json in ParkSeed shape, ready for scripts/build-seed.ts.
 *
 * WHY ONLY SOME STATES
 * ---------------------
 * OSM tags an ocean beach and a lake beach identically: `natural=beach`. Separating them
 * needs either a coastline dataset or an expensive Overpass query against every lake
 * polygon in the state, and that query times out on a state the size of Florida.
 *
 * So the harvest is limited to states where the distinction is free: the landlocked ones,
 * where every beach is freshwater by definition, plus the Great Lakes states, whose
 * coastline IS fresh water. That is 25 states and the large majority of American lake
 * swimming, and it needs no filter that could be wrong.
 *
 * Coastal states are deliberately out of scope here and stay hand-curated until there is a
 * filter worth trusting.
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
/** Overpass throttles a client that asks again immediately; one state at a time, politely. */
const GAP_MS = 6_000;
/** What Overpass is told it may spend. The client gives up sooner, on the run's deadline. */
const SERVER_TIMEOUT_S = 180;

/** Stops the run when the service is not answering today. See createDeadline. */
const deadline = createDeadline();

/**
 * States where every `natural=beach` is fresh water.
 *
 * The landlocked 21, plus Michigan, Wisconsin, Ohio and Pennsylvania, whose only coast is
 * a Great Lake. Minnesota is in the first group and is also a Great Lakes state.
 */
export const FRESHWATER_STATES = [
  "AR", "AZ", "CO", "IA", "ID", "IL", "IN", "KS", "KY", "MI", "MN", "MO", "MT", "ND", "NE",
  "NM", "NV", "OH", "OK", "PA", "SD", "TN", "UT", "VT", "WI", "WV", "WY",
] as const;

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/**
 * Named swim areas in one state.
 *
 * `natural=beach` is by far the best-populated tag (about 100 named ones in Minnesota
 * alone); `leisure=swimming_area` is the semantically correct one but barely used, so both
 * are asked for. A name is required: an unnamed beach polygon cannot be presented as a
 * destination.
 */
export function buildStateQuery(state: string): string {
  return [
    `[out:json][timeout:${SERVER_TIMEOUT_S}];`,
    `area["ISO3166-2"="US-${state}"][admin_level=4]->.a;`,
    "(",
    '  nwr["natural"="beach"]["name"](area.a);',
    '  nwr["leisure"="swimming_area"]["name"](area.a);',
    ");",
    "out tags center;",
  ].join("\n");
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

/** Tags that mean "not somewhere the public can go and swim". */
function isPublic(tags: Record<string, string>): boolean {
  const access = tags.access;
  if (access === "private" || access === "no" || access === "permit" || access === "customers") return false;
  if (tags.seasonal === "no" && tags.disused === "yes") return false;
  return true;
}

function coords(el: OverpassElement): { lat: number; lng: number } | null {
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

/** A ParkSeed row, minus the curation we do not have for community data. */
export interface OsmPark {
  slug: string;
  name: string;
  type: "lake";
  state: string;
  operator: "state" | "county" | "private";
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
 * OSM's `operator` tag is free text. Only the three values the schema allows are inferred,
 * and anything unrecognised falls back to county, which is what most American lake
 * beaches actually are.
 */
function inferOperator(tags: Record<string, string>): OsmPark["operator"] {
  const op = `${tags.operator ?? ""} ${tags.name ?? ""}`.toLowerCase();
  if (/\bstate\b/.test(op)) return "state";
  if (/\b(private|resort|club|campground)\b/.test(op)) return "private";
  return "county";
}

/**
 * Elements to parks, de-duplicated.
 *
 * Slugs are namespaced by state because park names are not unique across the country:
 * "Blue Spring State Park" exists in more than one, and the seed upserts on slug, so an
 * un-namespaced collision would silently overwrite a real park with a different one.
 */
export function normalize(elements: OverpassElement[], state: string): OsmPark[] {
  const bySlug = new Map<string, OsmPark>();
  for (const el of elements ?? []) {
    const tags = el.tags ?? {};
    const name = (tags.name ?? "").trim();
    if (!name || !isPublic(tags)) continue;
    const at = coords(el);
    if (!at) continue;

    const slug = `${kebab(name)}-${state.toLowerCase()}`;
    if (!slug || bySlug.has(slug)) continue;
    const osmRef = `${el.type}/${el.id}`;
    bySlug.set(slug, {
      slug,
      name,
      // Everything harvested here sits on inland water in a state with no salt coast, so
      // "lake" is the honest default. A river swim area mis-typed as a lake costs nothing
      // the UI depends on; inventing a type we have not checked would.
      type: "lake",
      state,
      operator: inferOperator(tags),
      lat: round5(at.lat),
      lng: round5(at.lng),
      coverage_tier: "basic",
      // Community data. Nobody has confirmed you may swim here, and the UI says so.
      swimming_verified: false,
      guarded: "unknown",
      hours: null,
      fees: null,
      reservation_required: false,
      reservation_url: null,
      rules: {},
      // The stations job fills the gauge and grid columns on its next pass.
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
      sources: [`https://www.openstreetmap.org/${el.type}/${el.id}`],
      osm_ref: osmRef,
    });
  }
  return [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

async function fetchState(state: string): Promise<OverpassElement[]> {
  const cachePath = join(CACHE_DIR, `osm-swim-${state}.json`);
  if (!REFRESH) {
    const cached = readJson<{ elements: OverpassElement[] }>(cachePath);
    if (cached) {
      log(`${state}: ${cached.elements?.length ?? 0} elements (cache)`);
      return cached.elements ?? [];
    }
  }

  const body = new URLSearchParams({ data: buildStateQuery(state) }).toString();
  let lastError: unknown = null;
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT, Accept: "application/json" },
        body,
        signal: AbortSignal.timeout(requestTimeout(deadline)),
      });
      if (!res.ok) {
        lastError = new Error(`${endpoint}: HTTP ${res.status}`);
        continue;
      }
      const json = (await res.json()) as { elements?: OverpassElement[] };
      writeJson(cachePath, json);
      log(`${state}: ${json.elements?.length ?? 0} elements (network)`);
      return json.elements ?? [];
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const states = args.length > 0 ? args.map((s) => s.toUpperCase()) : [...FRESHWATER_STATES];
  for (const s of states) {
    if (!(FRESHWATER_STATES as readonly string[]).includes(s)) {
      throw new Error(`${s} is not in FRESHWATER_STATES: its beaches cannot be assumed fresh water`);
    }
  }

  // Keep what previous runs harvested so a throttled state does not lose the others.
  const previous = readJson<{ parks: OsmPark[] }>(OUT_PATH)?.parks ?? [];
  const bySlug = new Map(previous.map((p) => [p.slug, p]));
  const failed: string[] = [];

  for (const [i, state] of states.entries()) {
    try {
      const elements = await fetchState(state);
      const parks = normalize(elements, state);
      for (const park of parks) bySlug.set(park.slug, park);
      log(`${state}: ${parks.length} named public swim areas`);
    } catch (err) {
      failed.push(state);
      console.warn(`[osm] ${state} failed: ${(err as Error).message}`);
    }
    if (i < states.length - 1) await sleep(GAP_MS);
  }

  const parks = [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  writeJson(OUT_PATH, {
    _note:
      "Freshwater swim areas harvested from OpenStreetMap by scripts/fetch-osm-swim-areas.ts. " +
      "Limited to landlocked and Great Lakes states, where a natural=beach is fresh water by definition. " +
      "Slugs are namespaced by state because park names are not unique across the country. " +
      "Unverified community data: swimming_verified is false and coverage_tier is basic.",
    generated_at: new Date().toISOString(),
    states: states.filter((s) => !failed.includes(s)),
    parks,
  });
  log(`wrote ${OUT_PATH}: ${parks.length} parks across ${new Set(parks.map((p) => p.state)).size} states` +
    (failed.length ? `; FAILED: ${failed.join(", ")}` : ""));
}

await main();
