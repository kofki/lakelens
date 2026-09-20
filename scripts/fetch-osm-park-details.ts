/**
 * Harvest the practical details OSM already knows about the community-sourced parks.
 *
 *   node --experimental-strip-types scripts/fetch-osm-park-details.ts [--limit=N] [--refresh]
 *
 * Reads data/parks.osm.json (owned by scripts/fetch-osm-swim-areas.ts, never written here)
 * and writes data/park-details.osm.json keyed by park slug.
 *
 * WHY A SECOND PASS
 * -----------------
 * The swim-area harvest asks Overpass for geometry across a whole state and deliberately
 * keeps only what it can trust, so every one of those parks lands with hours: null. The
 * tags that answer "can I actually go there right now" are already on the same elements,
 * so this pass fetches them by id instead of re-running the expensive area queries.
 *
 * WHY THE CONVERSION IS TIMID
 * ---------------------------
 * lib/openingHours.ts reads curated English ("8 a.m. to sundown"). OSM speaks a formal
 * syntax with month selectors, public-holiday rules and conditional clauses that no small
 * converter can honour. The app turns hours into a CLOSED badge, so a value converted
 * wrongly actively lies to someone standing at a gate that is open. Anything outside the
 * handful of unambiguous shapes below is kept as the raw string and marked unconverted,
 * which the seed can leave out of `hours` entirely.
 */
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Node's type-stripping needs the explicit .ts extension at runtime, but the root tsconfig
// has no allowImportingTsExtensions, so a computed specifier keeps both tsc and `node` happy.
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
const OUT_PATH = join(DATA_DIR, "park-details.osm.json");
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
/** Overpass answers HTTP 406 to a client that asks again immediately; one chunk at a time. */
const GAP_MS = 6_000;
/**
 * What Overpass is told it may spend. Lower than the other scripts because this is an id
 * lookup over a known set, not a search: if it has not answered in 90 seconds it will not.
 * The client gives up sooner still, on the run's deadline.
 */
const SERVER_TIMEOUT_S = 90;

/** Stops the run when the service is not answering today. See createDeadline. */
const deadline = createDeadline();
/**
 * An id lookup is cheap per element, so the limit is the server-side deadline rather than
 * the data. 150 ids resolve in a couple of seconds, well inside the 90 s timeout asked for
 * below, and a chunk that does fail costs only its own parks on the retry.
 */
const CHUNK = 150;

/** Tags worth carrying: the ones that change what a visitor does when they arrive. */
const WANTED = [
  "opening_hours",
  "fee",
  "website",
  "operator",
  "phone",
  "description",
  "wheelchair",
  "supervised",
  "dog",
] as const;
type WantedTag = (typeof WANTED)[number];

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  tags?: Record<string, string>;
}

interface ParksFile {
  parks: Array<{ slug: string; osm_ref?: string | null }>;
}

export interface ConvertedHours {
  /** The OSM value exactly as tagged, always kept so a human can check the conversion. */
  raw: string;
  /** Plain English that lib/openingHours.ts can read, or null when we refused to convert. */
  text: string | null;
  /** False means "we did not understand this"; the app must not derive a closure from it. */
  converted: boolean;
}

/** "08:00" to "8 a.m.", in the shape lib/openingHours.ts already parses. */
function clockToEnglish(hhmm: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (minute > 59) return null;
  // Midnight at either end is the ambiguous case: "00:00-24:00" is all day, "20:00-00:00"
  // crosses into tomorrow, and neither survives a translation into a simple range. Refuse.
  if (hour < 1 || hour > 23) return null;
  const meridiem = hour < 12 ? "a.m." : "p.m.";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0 ? `${h12} ${meridiem}` : `${h12}:${m[2]} ${meridiem}`;
}

/**
 * OSM opening_hours syntax to the prose the app parses.
 *
 * Pure so the refusals can be pinned down in a test: they are the point of the function,
 * not its edge. Only values that mean the same thing every day of the year convert. A
 * separator (`;` or `,`), a weekday range narrower than the whole week, a month or week
 * selector, a conditional comment, a public-holiday rule or an `off` clause all mean the
 * value carries an exception, and an exception dropped on the floor is the failure mode
 * that tells someone the park is shut when it is not.
 */
export function convertOsmHours(raw: string): ConvertedHours {
  const value = (raw ?? "").trim();
  const refuse: ConvertedHours = { raw: value, text: null, converted: false };
  if (!value) return refuse;

  const lower = value.toLowerCase();
  // The offset test looks for a digit after the sign, so plain "sunrise-sunset" survives it.
  if (/[;,]|\boff\b|\bph\b|\bsh\b|(sunrise|sunset)\s*[+-]\s*\d|"|\bweek\b|\|\|/.test(lower)) return refuse;
  if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/.test(lower)) return refuse;

  if (lower === "24/7") return { raw: value, text: "Open 24 hours.", converted: true };
  // No opening clock time, so lib/openingHours.ts leaves opensMin null and only computes
  // the sunset close. That is exactly right: a park with no gate in the morning is open.
  if (lower === "sunrise-sunset") return { raw: value, text: "Sunrise to sundown.", converted: true };

  // A leading "Mo-Su" (or "Mo-Su," style day list) is the only weekday selector that adds
  // nothing, because it is every day. Strip it and fall through to the bare range.
  const range = lower.replace(/^mo\s*-\s*su\s+/, "").trim();
  const m = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(range);
  if (!m) return refuse;
  const open = clockToEnglish(m[1]);
  const close = clockToEnglish(m[2]);
  if (!open || !close) return refuse;
  // No full stop: the times already end in one ("8 p.m."), and doubling it reads as a typo.
  return { raw: value, text: `${open} to ${close}`, converted: true };
}

export interface ParkDetails {
  osm_ref: string;
  opening_hours?: string;
  /** Present only when opening_hours is, so the seed never has to re-run the converter. */
  hours_text?: string;
  hours_converted?: boolean;
  fee?: string;
  website?: string;
  operator?: string;
  phone?: string;
  description?: string;
  wheelchair?: string;
  supervised?: string;
  dog?: string;
}

/**
 * Tags to a details row, absent tags simply absent.
 *
 * Nulls are not written: a null here would be indistinguishable from "OSM says there is no
 * fee", and downstream the difference between "unknown" and "free" is the whole point.
 */
export function toDetails(osmRef: string, tags: Record<string, string>): ParkDetails {
  const out: ParkDetails = { osm_ref: osmRef };
  for (const tag of WANTED) {
    const value = (tags[tag] ?? "").trim();
    if (!value) continue;
    out[tag as WantedTag] = value;
  }
  if (out.opening_hours) {
    const converted = convertOsmHours(out.opening_hours);
    if (converted.text) out.hours_text = converted.text;
    out.hours_converted = converted.converted;
  }
  return out;
}

/** `way/12345` to the Overpass id-lookup clause for its own element type. */
export function buildRefQuery(refs: readonly string[]): string {
  const byType = new Map<string, number[]>([["node", []], ["way", []], ["relation", []]]);
  for (const ref of refs) {
    const [type, id] = ref.split("/");
    const ids = byType.get(type === "rel" ? "relation" : type);
    if (ids && /^\d+$/.test(id ?? "")) ids.push(Number(id));
  }
  const clauses = [...byType]
    .filter(([, ids]) => ids.length > 0)
    .map(([type, ids]) => `  ${type}(id:${ids.join(",")});`);
  return [`[out:json][timeout:${SERVER_TIMEOUT_S}];`, "(", ...clauses, ");", "out tags;"].join("\n");
}

/** A chunk keyed by its own contents, so adding parks does not invalidate earlier caches. */
function cacheName(refs: readonly string[]): string {
  let hash = 5381;
  for (const ch of refs.join(",")) hash = ((hash * 33) ^ ch.charCodeAt(0)) >>> 0;
  return `osm-details-${refs.length}-${hash.toString(16)}.json`;
}

async function fetchChunk(refs: readonly string[]): Promise<OverpassElement[]> {
  const cachePath = join(CACHE_DIR, cacheName(refs));
  if (!REFRESH) {
    const cached = readJson<{ elements: OverpassElement[] }>(cachePath);
    if (cached) {
      log(`${refs.length} refs: ${cached.elements?.length ?? 0} elements (cache)`);
      return cached.elements ?? [];
    }
  }

  // Pre-encoded form body: Overpass rejects a multipart or JSON body outright, and the
  // swim-area harvest settled on this exact shape after a run of 406s.
  const body = new URLSearchParams({ data: buildRefQuery(refs) }).toString();
  let lastError: unknown = null;
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
        body,
        signal: AbortSignal.timeout(requestTimeout(deadline)),
      });
      if (!res.ok) {
        // 406 is Overpass saying "you asked too fast", not "your query is wrong", so the
        // next mirror is worth trying before the chunk is given up on.
        lastError = new Error(`${endpoint}: HTTP ${res.status}${res.status === 406 ? " (throttled)" : ""}`);
        continue;
      }
      const json = (await res.json()) as { elements?: OverpassElement[] };
      writeJson(cachePath, json);
      log(`${refs.length} refs: ${json.elements?.length ?? 0} elements (network)`);
      return json.elements ?? [];
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function main(): Promise<void> {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : Infinity;

  const parks = (readJson<ParksFile>(IN_PATH)?.parks ?? []).filter((p) => typeof p.osm_ref === "string" && p.osm_ref);
  if (parks.length === 0) throw new Error(`${IN_PATH} has no parks with an osm_ref: run fetch-osm-swim-areas.ts first`);
  const wanted = parks.slice(0, Number.isFinite(limit) ? Math.max(0, limit) : parks.length);

  // Keep what earlier runs harvested, so a throttled chunk costs only its own parks.
  const previous = readJson<{ details: Record<string, ParkDetails> }>(OUT_PATH)?.details ?? {};
  const details: Record<string, ParkDetails> = { ...previous };

  const slugByRef = new Map(wanted.map((p) => [p.osm_ref as string, p.slug]));
  const chunks = chunk([...slugByRef.keys()], CHUNK);
  let failedRefs = 0;
  let queried = 0;

  for (const [i, refs] of chunks.entries()) {
    try {
      const elements = await fetchChunk(refs);
      queried += refs.length;
      for (const el of elements) {
        const ref = `${el.type}/${el.id}`;
        const slug = slugByRef.get(ref);
        if (!slug) continue;
        details[slug] = toDetails(ref, el.tags ?? {});
      }
    } catch (err) {
      failedRefs += refs.length;
      console.warn(`[osm-details] chunk ${i + 1}/${chunks.length} failed: ${(err as Error).message}`);
    }
    if (i < chunks.length - 1) await sleep(GAP_MS);
  }

  // Only the parks in this run count toward coverage: the file may carry older ones.
  const rows = [...slugByRef.values()].map((slug) => details[slug]).filter((d): d is ParkDetails => Boolean(d));
  const counts = Object.fromEntries(WANTED.map((tag) => [tag, rows.filter((r) => r[tag] !== undefined).length]));
  const withHours = rows.filter((r) => r.opening_hours !== undefined);
  const cleanHours = withHours.filter((r) => r.hours_converted === true).length;

  writeJson(OUT_PATH, {
    _note:
      "Practical OSM tags for the community-sourced parks, harvested by scripts/fetch-osm-park-details.ts. " +
      "Keyed by park slug; absent tags are absent rather than null. " +
      "hours_text is opening_hours rendered into the prose lib/openingHours.ts parses, and is only " +
      "safe to use as `hours` when hours_converted is true: an unconverted value may hide an exception.",
    generated_at: new Date().toISOString(),
    details,
  });

  log(`queried ${queried} parks (${failedRefs} left unqueried), ${rows.length} answered with tags`);
  for (const tag of WANTED) log(`  ${tag}: ${counts[tag]}`);
  log(`  hours converted cleanly: ${cleanHours}/${withHours.length}`);
  log(`wrote ${OUT_PATH}: ${Object.keys(details).length} parks`);
  if (failedRefs > 0) {
    console.warn(
      `[osm-details] ${failedRefs} parks were not queried: every mirror refused. ` +
        "Overpass throttles repeat clients; wait a few minutes and re-run, the cached chunks are kept.",
    );
  }
}

// Same guard build-seed.ts uses: the converter is exported for the unit test, and importing
// it must not fire off Overpass queries.
const isDirectRun = (() => {
  try {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
  } catch {
    return false;
  }
})();

if (isDirectRun) await main();
