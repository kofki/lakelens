/**
 * The nearest town to every park, worked out here instead of asked over the network.
 *
 *   node --experimental-strip-types scripts/assign-places.ts
 *
 * Writes data/places.json, the same file the Nominatim script wrote.
 *
 * WHY THIS REPLACED THE GEOCODER
 * ------------------------------
 * scripts/fetch-place-names.ts reverse-geocodes each park through Nominatim, whose usage
 * policy allows one request a second. That was fine at 886 parks and is about seven hours
 * at 25,503. The answer does not need a service: the Census Bureau publishes every
 * populated place in the country with its coordinates, it is public domain, and the whole
 * file is four megabytes. Matching 25,000 parks against 32,000 places is a few seconds of
 * arithmetic.
 *
 * It is also a better answer. Nominatim returned a county for a lake an hour from a city,
 * which is why 808 parks showed a bare state; the gazetteer has every incorporated place
 * and census-designated place, so a rural lake gets the hamlet it is actually near.
 */
import { join } from "node:path";
import { readFileSync } from "node:fs";

const { DATA_DIR, log, readJson, writeJson }: typeof import("./fetch-lib") =
  await import("./fetch-lib" + ".ts");

const GAZETTEER = join(DATA_DIR, "gazetteer", "2024_Gaz_place_national.txt");
const OUT_PATH = join(DATA_DIR, "places.json");

/**
 * How far a town may be and still be the answer.
 *
 * 40 km is about a half-hour drive. Past that "near" is a claim rather than a fact, and the
 * state alone is the honest label.
 */
export const MAX_KM = 40;

export interface Place {
  city: string | null;
  state: string | null;
}

interface GazPlace {
  name: string;
  state: string;
  lat: number;
  lng: number;
}

/**
 * The Census NAME carries its own type: "Abanda CDP", "Gainesville city", "Lake Placid
 * village". The suffix is a classification, not part of what anyone calls the place.
 */
const TYPE_SUFFIX =
  /\s+(CDP|city|town|village|borough|municipality|township|comunidad|zona urbana|urbana|\(balance\)|county|consolidated government|metro government|metropolitan government|unified government|corporation|plantation|gore|grant|location|reservation|district)$/i;

export function cleanPlaceName(raw: string): string {
  // Exactly one suffix. Stripping repeatedly turned "Lake City city" into "Lake", because
  // the second pass ate the half of the name that is a word in the list.
  return raw.trim().replace(TYPE_SUFFIX, "").trim();
}

export function parseGazetteer(text: string): GazPlace[] {
  const out: GazPlace[] = [];
  const lines = text.split("\n");
  for (const line of lines.slice(1)) {
    const cols = line.split("\t");
    if (cols.length < 12) continue;
    const state = cols[0]?.trim();
    const name = cleanPlaceName(cols[3] ?? "");
    const lat = Number(cols[10]);
    const lng = Number(cols[11]);
    if (!state || !name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({ name, state, lat, lng });
  }
  return out;
}

const R = 6371;
function km(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The nearest place in the same state.
 *
 * Same state on purpose: a park ten miles from a border should be described by a town in
 * its own state, because that is the one whose county, rules and signage apply to it.
 */
export function nearestPlace(
  park: { lat: number; lng: number; state?: string | null },
  byState: Map<string, GazPlace[]>,
  maxKm = MAX_KM,
): Place {
  const state = park.state ?? null;
  const candidates = state ? (byState.get(state) ?? []) : [];
  let best: { name: string; km: number } | null = null;
  for (const place of candidates) {
    // Cheap rejection before the trigonometry: one degree of latitude is 111 km.
    if (Math.abs(place.lat - park.lat) > maxKm / 100) continue;
    const d = km(park.lat, park.lng, place.lat, place.lng);
    if (!best || d < best.km) best = { name: place.name, km: d };
  }
  return { city: best && best.km <= maxKm ? best.name : null, state };
}

interface Point {
  slug: string;
  lat: number;
  lng: number;
  state?: string | null;
}

async function main(): Promise<void> {
  const places = parseGazetteer(readFileSync(GAZETTEER, "utf8"));
  const byState = new Map<string, GazPlace[]>();
  for (const place of places) {
    const list = byState.get(place.state);
    if (list) list.push(place);
    else byState.set(place.state, [place]);
  }
  log(`${places.length} places across ${byState.size} states`);

  const parks: Point[] = [];
  const seen = new Set<string>();
  for (const file of ["parks.deep.json", "parks.extra.json", "parks.basic.json", "parks.osm.json"]) {
    for (const park of readJson<{ parks: Point[] }>(join(DATA_DIR, file))?.parks ?? []) {
      if (seen.has(park.slug)) continue;
      seen.add(park.slug);
      parks.push(park);
    }
  }

  const out: Record<string, Place> = {};
  let withCity = 0;
  for (const park of parks) {
    const place = nearestPlace(park, byState);
    out[park.slug] = place;
    if (place.city) withCity += 1;
  }

  writeJson(OUT_PATH, {
    _note:
      "Nearest town to each park, from the US Census Bureau 2024 national place gazetteer " +
      "(public domain) by scripts/assign-places.ts. city is null when no place in the same " +
      `state is within ${MAX_KM} km.`,
    generated_at: new Date().toISOString(),
    max_km: MAX_KM,
    places: out,
  });
  log(`wrote ${OUT_PATH}: ${parks.length} parks, ${withCity} with a town`);
}

// Guarded: importing this module for its helpers must not rewrite the file.
if (import.meta.url === `file://${process.argv[1]}`) await main();
