/**
 * Name the water each harvested swim area actually sits on.
 *
 *   node --experimental-strip-types scripts/fetch-osm-water-bodies.ts [--refresh] [--limit=N]
 *
 * Reads data/parks.osm.json, writes data/water-bodies.osm.json keyed by slug.
 *
 * WHY THIS EXISTS
 * ---------------
 * scripts/fetch-osm-swim-areas.ts asks OSM for `natural=beach` and trusts the state to
 * make the answer fresh: a beach in a landlocked or Great Lakes state cannot be on salt
 * water. That is true, and it is not enough. It verifies nothing about the water itself,
 * so it typed all 576 rows "lake" without looking, and a sandbar on a river, a pond nobody
 * swims in and a Lake Michigan city beach all arrived looking identical.
 *
 * This asks the question the harvest skipped: what named water body is within walking
 * distance of this point, and is it fresh? A swim area that cannot answer is dropped,
 * because "some beach, somewhere, on something" is not a destination.
 *
 * It also unblocks the coastal states. Once a park has to name its lake, California and
 * Florida stop being dangerous to harvest: an ocean beach names no lake and falls out.
 *
 * WHY ONE QUERY PER STATE AND NOT ONE PER PARK
 * --------------------------------------------
 * The obvious shape is an `around` query per park. It was tried, and it does not finish:
 * a single point took 204 seconds on the one mirror that was still answering, twelve
 * points in a batch timed out on all three, and the main endpoint refused this IP outright
 * after a morning of harvesting.
 *
 * So each state is asked once for every named lake and river it contains, with bounding
 * boxes, and the matching happens here. That is 21 requests instead of 846, it caches, and
 * a re-run costs nothing.
 *
 * WHAT A BOUNDING BOX CAN AND CANNOT TELL YOU
 * -------------------------------------------
 * A box is not a shoreline. Around a crescent-shaped lake it covers water the lake is not
 * in, so the smallest box containing the point wins: a small inland lake beats Lake
 * Michigan wherever both contain the park, and Lake Michigan only wins where nothing
 * smaller does. Rivers are taken from ways rather than relations, because a relation for
 * the Mississippi has a box the size of the country and would match everything in it.
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

const IN_PATH = join(DATA_DIR, "parks.osm.json");
const OUT_PATH = join(DATA_DIR, "water-bodies.osm.json");
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
/** Overpass blocks an IP that asks continuously. This is deliberately slower than it needs to be. */
const GAP_MS = 8_000;
/**
 * What Overpass is told it may spend on the query. The client gives up much sooner, via the
 * run's deadline: 180 is the server's ceiling, not a sensible wait.
 */
const SERVER_TIMEOUT_S = 180;

/** Stops the run when the service is not answering today. See createDeadline. */
const deadline = createDeadline();

export interface WaterProbe {
  /**
   * Names of still fresh water: things tagged `water=lake|reservoir|pond|oxbow`.
   *
   * Asked for separately rather than filtered out of `names` afterwards, because Overpass
   * returns names and tags as two independent sets with no correspondence between them.
   * A Chicago lakefront beach comes back as names "Burnham Harbor North Basin;Lake
   * Michigan" and kinds "harbour;lake", and nothing in that pairing says which is which.
   */
  lakes: string[];
  /** Names of nearby named rivers, streams and canals. */
  rivers: string[];
  /** Every named water area, whatever it is. Only consulted when the two above are empty. */
  names: string[];
  /** true when a `natural=coastline` way is within the radius: the sea is right there. */
  coastline: boolean;
  /** true when a spring is mapped within the radius. */
  spring: boolean;
}

export type WaterType = "lake" | "river" | "spring";

export interface WaterVerdict {
  /** null when the point cannot name its water, which is a rejection. */
  water_body: string | null;
  type: WaterType | null;
  /** One of the five Great Lakes or Lake St. Clair, whose shore beaches read as sea beaches. */
  great_lake: boolean;
  reason: string;
}

/** The five, plus St. Clair, which is the same kind of place to stand on. */
const GREAT_LAKES = /\blake\s+(michigan|superior|huron|erie|ontario|st\.?\s*clair)\b/i;

/**
 * Water whose name says salt. Landlocked states have none of these, but the classifier
 * runs against coastal states next and a "lagoon" or "sound" there is not a lake.
 */
const SALT_NAME = /\b(ocean|sea|gulf|sound|bay|inlet|lagoon|harbou?r|strait|channel|pass)\b/i;
/** `water=` values that count as still fresh water, used to build the query. */
export const LAKE_KINDS = ["lake", "reservoir", "pond", "oxbow"];
/** `waterway=` values that count as moving fresh water. */
export const RIVER_WAYS = ["river", "stream", "canal"];

/**
 * What the probe means.
 *
 * Rejection is the default. A point keeps its place only by naming fresh water, so the
 * failure mode of every gap in OSM is a missing park rather than a wrong one.
 */
const clean = (values: string[]) => values.map((v) => v.trim()).filter(Boolean);

export function classify(probe: WaterProbe): WaterVerdict {
  const reject = (reason: string): WaterVerdict => ({ water_body: null, type: null, great_lake: false, reason });

  // The sea being in range outranks anything the water is called.
  if (probe.coastline) return reject("coastline within range");

  // A still-water name first: a lake beach with a feeder creek is a lake beach, and that is
  // the water people are standing in. Salt-sounding names are skipped rather than fatal,
  // because a marina basin next to Lake Michigan does not make Lake Michigan salty.
  const lakes = clean(probe.lakes).filter((n) => !SALT_NAME.test(n));
  const rivers = clean(probe.rivers).filter((n) => !SALT_NAME.test(n));

  if (lakes.length > 0) {
    const name = lakes[0]!;
    return { water_body: name, type: "lake", great_lake: GREAT_LAKES.test(name), reason: "ok" };
  }
  if (probe.spring) {
    // A spring with no lake around it is the spring itself, which is what a name here means.
    const name = clean(probe.names).find((n) => !SALT_NAME.test(n)) ?? rivers[0];
    if (name) return { water_body: name, type: "spring", great_lake: false, reason: "ok" };
  }
  if (rivers.length > 0) {
    return { water_body: rivers[0]!, type: "river", great_lake: false, reason: "ok" };
  }

  const all = clean(probe.names);
  if (all.length === 0) return reject("no named water within range");
  // Everything nearby was a harbour, a lagoon or a sound. That is not a lake.
  return reject(`no fresh water within range: ${all.slice(0, 3).join(", ")}`);
}

interface Point {
  slug: string;
  lat: number;
  lng: number;
  state?: string | null;
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
  tags?: Record<string, string>;
}

export interface WaterFeature {
  name: string;
  kind: "lake" | "river" | "coastline";
  /** [south, west, north, east]. A node feature gets a degenerate box at its point. */
  bbox: [number, number, number, number];
}

/**
 * Every named lake and river in one state, with boxes rather than geometry.
 *
 * `withCoastline` adds the shoreline, which is only asked for where there is salt water:
 * it is pure cost in Kansas, and the single most important fact in California.
 */
export function buildStateWaterQuery(state: string, withCoastline = false): string {
  const lakes = `["water"~"^(${LAKE_KINDS.join("|")})$"]`;
  const rivers = `["waterway"~"^(${RIVER_WAYS.join("|")})$"]`;
  return [
    `[out:json][timeout:${SERVER_TIMEOUT_S}];`,
    `area["ISO3166-2"="US-${state}"][admin_level=4]->.a;`,
    "(",
    `  nwr["natural"="water"]["name"]${lakes}(area.a);`,
    // Ways only. A relation for a long river has a box the size of the state.
    `  way["name"]${rivers}(area.a);`,
    ...(withCoastline ? [`  way["natural"="coastline"](area.a);`] : []),
    ");",
    "out ids tags bb;",
  ].join("\n");
}

export function parseWaterFeatures(elements: OverpassElement[]): WaterFeature[] {
  const out: WaterFeature[] = [];
  for (const el of elements ?? []) {
    const tags = el.tags ?? {};
    // Coastline ways are almost all unnamed, and their name is irrelevant: what matters is
    // that the sea is here.
    if (tags.natural === "coastline") {
      if (el.bounds) {
        out.push({ name: "", kind: "coastline", bbox: [el.bounds.minlat, el.bounds.minlon, el.bounds.maxlat, el.bounds.maxlon] });
      }
      continue;
    }
    const name = (tags.name ?? "").trim();
    if (!name) continue;
    const kind: WaterFeature["kind"] = tags.waterway ? "river" : "lake";
    if (el.bounds) {
      out.push({ name, kind, bbox: [el.bounds.minlat, el.bounds.minlon, el.bounds.maxlat, el.bounds.maxlon] });
    } else if (typeof el.lat === "number" && typeof el.lon === "number") {
      out.push({ name, kind, bbox: [el.lat, el.lon, el.lat, el.lon] });
    }
  }
  return out;
}

/**
 * How far outside a box still counts as being on that water.
 *
 * A beach is on the shore, and a car park or a mapping imprecision puts the point just
 * outside. 600 m is about the width of a large beach and its parking.
 */
export const PAD_M = 600;
const M_PER_DEG_LAT = 111_320;

function contains(bbox: WaterFeature["bbox"], point: Point, padM: number): boolean {
  const [s, w, n, e] = bbox;
  const padLat = padM / M_PER_DEG_LAT;
  const padLon = padLat / Math.max(Math.cos((point.lat * Math.PI) / 180), 0.2);
  return point.lat >= s - padLat && point.lat <= n + padLat && point.lng >= w - padLon && point.lng <= e + padLon;
}

/** Box area in square degrees. Only ever compared against another box, so units do not matter. */
function boxSize(bbox: WaterFeature["bbox"]): number {
  return Math.max(bbox[2] - bbox[0], 1e-9) * Math.max(bbox[3] - bbox[1], 1e-9);
}

/**
 * The water around one point, smallest box first.
 *
 * Sorting by size is what stops every Lake Michigan beach in Chicago from also matching
 * the three ponds in Grant Park: the nearest thing that actually contains the point is the
 * smallest one that does.
 */
/**
 * Above this, a coastline way's box says nothing useful.
 *
 * OSM splits the shoreline into ways of wildly different lengths. A short one has a tight
 * box and means the sea really is at this point; a long one can span half a state and
 * would reject every inland lake inside it. Roughly 0.05 degrees is 5 km.
 */
export const COASTLINE_MAX_BOX_DEG = 0.05;

export function probeFrom(point: Point, features: WaterFeature[], padM = PAD_M): WaterProbe {
  const hits = features
    .filter((f) => contains(f.bbox, point, padM))
    .sort((a, b) => boxSize(a.bbox) - boxSize(b.bbox));
  const lakes = hits.filter((f) => f.kind === "lake").map((f) => f.name);
  const rivers = hits.filter((f) => f.kind === "river").map((f) => f.name);
  const coastline = hits.some(
    (f) =>
      f.kind === "coastline" &&
      f.bbox[2] - f.bbox[0] <= COASTLINE_MAX_BOX_DEG &&
      f.bbox[3] - f.bbox[1] <= COASTLINE_MAX_BOX_DEG,
  );
  return {
    lakes: [...new Set(lakes)],
    rivers: [...new Set(rivers)],
    names: [...new Set([...lakes, ...rivers])],
    coastline,
    spring: false,
  };
}

async function post(query: string): Promise<OverpassElement[]> {
  // Pre-encoded: passing the URLSearchParams object itself makes fetch send a charset the
  // API answers with 406.
  const body = new URLSearchParams({ data: query }).toString();
  let lastError = "network error";
  for (const endpoint of ENDPOINTS) {
    if (deadline.expired()) throw new Error(`out of time after ${deadline.elapsedMin()} min (${lastError})`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeout(deadline));
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        body,
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
        signal: controller.signal,
      });
      if (res.ok) return ((await res.json()) as { elements?: OverpassElement[] }).elements ?? [];
      lastError = `HTTP ${res.status}`;
      // 406 and 429 are both "you are asking too fast", not "your query is wrong".
      if (res.status === 406 || res.status === 429) await sleep(GAP_MS * 3);
    } catch (err) {
      lastError = (err as Error).message;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Overpass refused the query (${lastError})`);
}

/**
 * States where the shoreline has to be asked for.
 *
 * Everything not in NO_SALT_COAST_STATES. Kept as its own list here so this script does not
 * import the harvester just to learn one fact.
 */
const SALT_COAST_STATES = new Set([
  "AK", "AL", "CA", "CT", "DC", "DE", "FL", "GA", "HI", "LA", "MA", "MD", "ME", "MS", "NC",
  "NH", "NJ", "NY", "OR", "RI", "SC", "TX", "VA", "WA",
]);

async function fetchState(state: string): Promise<WaterFeature[]> {
  const withCoastline = SALT_COAST_STATES.has(state);
  const cachePath = join(CACHE_DIR, `osm-water-${state}${withCoastline ? "-coast" : ""}.json`);
  if (!REFRESH) {
    const cached = readJson<{ features: WaterFeature[] }>(cachePath);
    if (cached?.features) {
      log(`${state}: ${cached.features.length} water features (cache)`);
      return cached.features;
    }
  }
  const features = parseWaterFeatures(await post(buildStateWaterQuery(state, withCoastline)));
  writeJson(cachePath, { features });
  log(`${state}: ${features.length} water features (network)`);
  return features;
}

async function main(): Promise<void> {
  const states = process.argv.slice(2).filter((a) => /^[A-Z]{2}$/.test(a));

  const source = readJson<{ parks: Point[] }>(IN_PATH);
  if (!source?.parks?.length) throw new Error(`no parks in ${IN_PATH}; run fetch-osm-swim-areas.ts first`);

  const byState = new Map<string, Point[]>();
  for (const park of source.parks) {
    const state = park.state ?? null;
    if (!state) continue;
    if (states.length > 0 && !states.includes(state)) continue;
    const list = byState.get(state) ?? [];
    list.push({ slug: park.slug, lat: park.lat, lng: park.lng, state });
    byState.set(state, list);
  }
  log(`${[...byState.values()].reduce((n, l) => n + l.length, 0)} parks across ${byState.size} states`);

  /**
   * Start from what is already on disk.
   *
   * Running for one state used to replace the whole file with that state's verdicts, which
   * silently unpublished every park everywhere else on the next seed build.
   */
  const existing = states.length > 0 ? (readJson<{ verdicts?: Record<string, WaterVerdict> }>(OUT_PATH)?.verdicts ?? {}) : {};
  const verdicts: Record<string, WaterVerdict> = { ...existing };
  const counts = { kept: 0, dropped: 0, greatLake: 0, lake: 0, river: 0, spring: 0 };
  const failed: string[] = [];

  const skipped: string[] = [];
  for (const [state, points] of [...byState].sort()) {
    if (deadline.expired()) {
      // Everything already matched is written below. A re-run starts from the cache.
      skipped.push(state);
      continue;
    }
    let features: WaterFeature[];
    try {
      features = await fetchState(state);
    } catch (err) {
      // One state's parks keep no verdict, which leaves them published unchanged rather
      // than dropped: a failed lookup is not evidence against a park.
      failed.push(state);
      log(`${state} failed: ${(err as Error).message}`);
      await sleep(GAP_MS);
      continue;
    }

    let kept = 0;
    for (const point of points) {
      const verdict = classify(probeFrom(point, features));
      verdicts[point.slug] = verdict;
      if (!verdict.water_body) counts.dropped += 1;
      else {
        kept += 1;
        counts.kept += 1;
        if (verdict.great_lake) counts.greatLake += 1;
        counts[verdict.type!] += 1;
      }
    }
    log(`${state}: ${kept}/${points.length} named their water`);
    await sleep(GAP_MS);
  }

  writeJson(OUT_PATH, {
    _note:
      "Water body each OSM swim area sits on, from scripts/fetch-osm-water-bodies.ts. " +
      "Matched by bounding box against every named lake and river in the state, smallest " +
      "box first. water_body null means the point named no fresh water and is not published.",
    generated_at: new Date().toISOString(),
    pad_m: PAD_M,
    verdicts,
  });
  log(`wrote ${OUT_PATH}`);
  log(`  kept ${counts.kept} (lake ${counts.lake}, river ${counts.river}, spring ${counts.spring})`);
  log(`  of those, Great Lakes shoreline: ${counts.greatLake}`);
  log(`  dropped ${counts.dropped}`);
  if (failed.length) log(`  states with no answer, left untouched: ${failed.join(", ")}`);
  if (skipped.length) {
    log(`  out of time after ${deadline.elapsedMin()} min; not reached: ${skipped.join(", ")}`);
    log("  cached states are kept, so re-running picks up where this stopped");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
