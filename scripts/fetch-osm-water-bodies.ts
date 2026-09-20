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
 * ALIGNMENT
 * ---------
 * Overpass returns one flat array, so a batch of `around` queries cannot be matched back
 * to its points by position when some return nothing. Each point therefore ends with a
 * `make` statement, which emits exactly one element whether or not the query matched, and
 * carries the point's index in the batch.
 */
import { join } from "node:path";

const { CACHE_DIR, DATA_DIR, REFRESH, USER_AGENT, log, readJson, sleep, writeJson }: typeof import("./fetch-lib") =
  await import("./fetch-lib" + ".ts");

const IN_PATH = join(DATA_DIR, "parks.osm.json");
const OUT_PATH = join(DATA_DIR, "water-bodies.osm.json");
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
/**
 * Points per request.
 *
 * 30 timed out on all three mirrors: four radius lookups each is 120 statements, and an
 * `around` filtered only by key is not cheap. 12 is what completes, and the cache means a
 * throttled run keeps everything it paid for and a re-run resumes.
 */
const BATCH = 12;
/** Overpass blocks an IP that asks continuously. This is deliberately slower than it needs to be. */
const GAP_MS = 8_000;
const TIMEOUT_MS = 180_000;
/**
 * How far the water may be. A swim area is on its water: 400 m covers a wide beach and a
 * point placed at the car park, and stops short of the next lake over.
 */
const RADIUS_M = 400;

export interface WaterProbe {
  /** Named water polygons found, most specific tag first. */
  names: string[];
  /** `water=` values seen (lake, reservoir, pond, river, ...). */
  kinds: string[];
  /** `waterway=` values seen on nearby linear water. */
  waterways: string[];
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
/** `water=` values that are salt or are not a place anyone swims. */
const SALT_KIND = new Set(["salt_pool", "salt_panne", "lagoon"]);
const LAKE_KIND = new Set(["lake", "reservoir", "pond", "oxbow", "basin", "lock", "moat"]);
const RIVER_KIND = new Set(["river", "stream", "canal", "ditch", "rapids"]);
const RIVER_WAY = new Set(["river", "stream", "canal", "riverbank", "tidal_channel"]);

/**
 * What the probe means.
 *
 * Rejection is the default. A point keeps its place only by naming fresh water, so the
 * failure mode of every gap in OSM is a missing park rather than a wrong one.
 */
export function classify(probe: WaterProbe): WaterVerdict {
  const names = probe.names.filter((n) => n.trim().length > 0);
  if (probe.coastline) {
    return { water_body: null, type: null, great_lake: false, reason: "coastline within range" };
  }
  if (names.length === 0) {
    return { water_body: null, type: null, great_lake: false, reason: "no named water within range" };
  }

  // A tidal channel next to a named lake still means salt water reaches this beach.
  const salty = names.find((n) => SALT_NAME.test(n));
  if (salty) return { water_body: null, type: null, great_lake: false, reason: `salt water name: ${salty}` };
  const saltKind = probe.kinds.find((k) => SALT_KIND.has(k));
  if (saltKind) return { water_body: null, type: null, great_lake: false, reason: `salt water tag: ${saltKind}` };

  // Prefer a still-water name when both are present: a lake beach with a feeder creek is a
  // lake beach, and that is the water people are standing in.
  const lakeish = probe.kinds.some((k) => LAKE_KIND.has(k));
  const riverish = probe.kinds.some((k) => RIVER_KIND.has(k)) || probe.waterways.some((w) => RIVER_WAY.has(w));
  const type: WaterType = probe.spring && !lakeish ? "spring" : lakeish ? "lake" : riverish ? "river" : "lake";

  const name = names[0]!;
  return { water_body: name, type, great_lake: GREAT_LAKES.test(name), reason: "ok" };
}

interface Point {
  slug: string;
  lat: number;
  lng: number;
}

/**
 * One request covering `points`.
 *
 * Three sets per point: named water areas, named linear waterways, and the two features
 * that are disqualifying or defining on their own (coastline, spring). The `make` carries
 * the index so a point that matched nothing still occupies its slot in the response.
 */
export function buildBatchQuery(points: Point[], radiusM = RADIUS_M): string {
  const parts = [`[out:json][timeout:${Math.round(TIMEOUT_MS / 1000)}];`];
  points.forEach((p, i) => {
    const at = `around:${radiusM},${p.lat},${p.lng}`;
    parts.push(
      `nwr(${at})["natural"="water"]["name"]->.w;`,
      `way(${at})["waterway"]->.r;`,
      `way(${at})["natural"="coastline"]->.c;`,
      `nwr(${at})["natural"="spring"]->.s;`,
      `make probe i=${i},` +
        ` names=w.set(t["name"]), kinds=w.set(t["water"]),` +
        ` waterways=r.set(t["waterway"]), coast=c.count(ways), spring=s.count(nwr);`,
      "out;",
    );
  });
  return parts.join("\n");
}

interface ProbeElement {
  tags?: Record<string, string>;
}

/** Overpass joins a `set()` with ";" and returns "" for an empty set. */
function splitSet(value: string | undefined): string[] {
  if (!value) return [];
  return [...new Set(value.split(";").map((s) => s.trim()).filter(Boolean))];
}

export function parseBatch(elements: ProbeElement[], points: Point[]): Map<string, WaterProbe> {
  const out = new Map<string, WaterProbe>();
  for (const el of elements ?? []) {
    const t = el.tags ?? {};
    const i = Number(t.i);
    const point = points[i];
    if (!point) continue;
    out.set(point.slug, {
      names: splitSet(t.names),
      kinds: splitSet(t.kinds),
      waterways: splitSet(t.waterways),
      coastline: Number(t.coast ?? 0) > 0,
      spring: Number(t.spring ?? 0) > 0,
    });
  }
  return out;
}

async function post(query: string): Promise<ProbeElement[]> {
  // Pre-encoded: passing the URLSearchParams object itself makes fetch send a charset the
  // API answers with 406.
  const body = new URLSearchParams({ data: query }).toString();
  let lastStatus = 0;
  for (const endpoint of ENDPOINTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        body,
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
        signal: controller.signal,
      });
      lastStatus = res.status;
      if (res.ok) return ((await res.json()) as { elements?: ProbeElement[] }).elements ?? [];
      // 406 and 429 are both "you are asking too fast", not "your query is wrong".
      if (res.status === 406 || res.status === 429) await sleep(GAP_MS * 3);
    } catch {
      // try the next mirror
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Overpass refused the batch (last status ${lastStatus || "network error"})`);
}

async function main(): Promise<void> {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;

  const source = readJson<{ parks: Point[] }>(IN_PATH);
  if (!source?.parks?.length) throw new Error(`no parks in ${IN_PATH}; run fetch-osm-swim-areas.ts first`);
  const points = source.parks.slice(0, limit).map((p) => ({ slug: p.slug, lat: p.lat, lng: p.lng }));

  const cachePath = join(CACHE_DIR, "osm-water-bodies.json");
  const cached = REFRESH ? {} : (readJson<Record<string, WaterProbe>>(cachePath) ?? {});
  const probes: Record<string, WaterProbe> = { ...cached };

  const todo = points.filter((p) => !probes[p.slug]);
  log(`${points.length} points, ${points.length - todo.length} cached, ${todo.length} to probe`);

  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    try {
      const elements = await post(buildBatchQuery(batch));
      const parsed = parseBatch(elements, batch);
      for (const [slug, probe] of parsed) probes[slug] = probe;
      log(`${i + batch.length}/${todo.length} probed (${parsed.size} answered)`);
      // Written every batch: a throttled run keeps everything it paid for.
      writeJson(cachePath, probes);
    } catch (err) {
      log(`batch at ${i} failed: ${(err as Error).message}`);
      log("cached batches are kept; wait a few minutes and re-run to continue");
      break;
    }
    if (i + BATCH < todo.length) await sleep(GAP_MS);
  }

  const verdicts: Record<string, WaterVerdict> = {};
  const counts = { kept: 0, dropped: 0, greatLake: 0, lake: 0, river: 0, spring: 0 };
  for (const p of points) {
    const probe = probes[p.slug];
    if (!probe) continue;
    const verdict = classify(probe);
    verdicts[p.slug] = verdict;
    if (!verdict.water_body) counts.dropped += 1;
    else {
      counts.kept += 1;
      if (verdict.great_lake) counts.greatLake += 1;
      counts[verdict.type!] += 1;
    }
  }

  writeJson(OUT_PATH, {
    _note:
      "Water body each OSM swim area sits on, from scripts/fetch-osm-water-bodies.ts. " +
      "water_body null means the point could not name fresh water within " +
      `${RADIUS_M} m and should not be published.`,
    generated_at: new Date().toISOString(),
    radius_m: RADIUS_M,
    verdicts,
  });
  log(`wrote ${OUT_PATH}`);
  log(`  kept ${counts.kept} (lake ${counts.lake}, river ${counts.river}, spring ${counts.spring})`);
  log(`  of those, Great Lakes shoreline: ${counts.greatLake}`);
  log(`  dropped ${counts.dropped}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
