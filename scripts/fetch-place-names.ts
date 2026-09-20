/**
 * The nearest town to each park, so a card can say where in the country it is.
 *
 *   node --experimental-strip-types scripts/fetch-place-names.ts [--refresh] [--limit=N]
 *
 * Reads every parks*.json, writes data/places.json keyed by slug.
 *
 * WHY NOMINATIM AND NOT OVERPASS
 * ------------------------------
 * Both could answer this. Nominatim returns a settled administrative answer ("Traverse
 * City, Michigan") where Overpass returns the nearest `place` node, which at a rural lake
 * is often a hamlet nobody has heard of. It is also a different service from the one the
 * swim-area harvest is already saturating.
 *
 * Nominatim's usage policy allows one request a second from an identified client, so this
 * is deliberately slow and caches every answer. Re-running costs nothing.
 */
import { join } from "node:path";

const { CACHE_DIR, DATA_DIR, REFRESH, USER_AGENT, log, readJson, sleep, writeJson }: typeof import("./fetch-lib") =
  await import("./fetch-lib" + ".ts");

const API = "https://nominatim.openstreetmap.org/reverse";
const OUT_PATH = join(DATA_DIR, "places.json");
/** Nominatim's published limit is one request per second. Do not lower this. */
const GAP_MS = 1_100;
/**
 * Zoom 10 is "city" in Nominatim's scale. Asking at a finer zoom returns the road or the
 * park itself, which is the name we already have.
 */
const ZOOM = 10;

export interface Place {
  /** Town, city or village. Null when the answer was a county or nothing at all. */
  city: string | null;
  /** Two-letter USPS code, for cross-checking the state the harvest assigned. */
  state: string | null;
}

/** Nominatim returns the full state name; the seed stores the code. */
const STATE_CODES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN",
  iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY",
};

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  municipality?: string;
  county?: string;
  state?: string;
}

/**
 * The most specific settlement in the answer.
 *
 * A county is deliberately not accepted as a city. "Marquette County, Michigan" reads like
 * a place you could drive to and is not one, and the state alone is more honest than a
 * wrong-looking town.
 */
export function pickPlace(address: NominatimAddress | undefined): Place {
  const a = address ?? {};
  const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.hamlet ?? null;
  const state = a.state ? (STATE_CODES[a.state.toLowerCase()] ?? null) : null;
  return { city: city?.trim() || null, state };
}

/** "Traverse City, MI", or just the state when the town is unknown. Null when neither is. */
export function placeLabel(place: Place | null | undefined): string | null {
  if (!place) return null;
  if (place.city && place.state) return `${place.city}, ${place.state}`;
  return place.city ?? place.state ?? null;
}

interface Point {
  slug: string;
  lat: number;
  lng: number;
}

async function reverse(point: Point): Promise<Place | null> {
  const url = `${API}?format=jsonv2&lat=${point.lat}&lon=${point.lng}&zoom=${ZOOM}&addressdetails=1`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { address?: NominatimAddress };
  const place = pickPlace(json.address);
  return place.city || place.state ? place : null;
}

async function main(): Promise<void> {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;

  const points: Point[] = [];
  const seen = new Set<string>();
  for (const file of ["parks.deep.json", "parks.extra.json", "parks.basic.json", "parks.osm.json"]) {
    const parsed = readJson<{ parks: Point[] }>(join(DATA_DIR, file));
    for (const park of parsed?.parks ?? []) {
      if (seen.has(park.slug)) continue;
      seen.add(park.slug);
      points.push({ slug: park.slug, lat: park.lat, lng: park.lng });
    }
  }

  const cachePath = join(CACHE_DIR, "places.json");
  const places: Record<string, Place> = REFRESH ? {} : (readJson<Record<string, Place>>(cachePath) ?? {});
  const todo = points.filter((p) => !places[p.slug]).slice(0, limit);
  log(`${points.length} parks, ${points.length - todo.length} cached, ${todo.length} to look up`);

  let failures = 0;
  for (const [i, point] of todo.entries()) {
    try {
      const place = await reverse(point);
      if (place) places[point.slug] = place;
    } catch (err) {
      failures += 1;
      // One town missing costs one card its location line. Stopping would cost all of them.
      if (failures <= 5) log(`${point.slug}: ${(err as Error).message}`);
    }
    if ((i + 1) % 50 === 0) {
      log(`${i + 1}/${todo.length} looked up, ${failures} failed`);
      writeJson(cachePath, places);
    }
    await sleep(GAP_MS);
  }
  writeJson(cachePath, places);

  const withCity = Object.values(places).filter((p) => p.city).length;
  writeJson(OUT_PATH, {
    _note:
      "Nearest town to each park, reverse-geocoded from OpenStreetMap Nominatim by " +
      "scripts/fetch-place-names.ts. city is null when the answer was a county or nothing.",
    generated_at: new Date().toISOString(),
    places,
  });
  log(`wrote ${OUT_PATH}: ${Object.keys(places).length} parks, ${withCity} with a town, ${failures} failed`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
