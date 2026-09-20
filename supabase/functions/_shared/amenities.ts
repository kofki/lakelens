/**
 * Park amenities from OpenStreetMap: what is actually there when you arrive.
 *
 * "Is there a bathroom" and "is there a pavilion we can sit under" decide whether a family
 * makes the drive as much as the water temperature does, and none of the conditions feeds
 * can answer either. OSM can: a single batched Overpass sweep over the 40 parks returned
 * 267 tagged features, led by toilets, shelters and piers.
 *
 * Counts rather than booleans, because "3 restrooms" and "1 restroom" are different
 * answers at a park that fills up. Absence is never asserted: a kind missing from the map
 * is missing from the object, and the UI shows no chip rather than a cross. OSM not having
 * mapped a bathroom is not evidence that there is no bathroom.
 */
import { haversineKm } from "./gauges.ts";

/** How far from the swim point a feature still counts as "at this park". */
export const AMENITY_RADIUS_M = 1500;

export type AmenityKind =
  | "toilets"
  | "shower"
  | "drinking_water"
  | "bbq"
  | "picnic_table"
  | "shelter"
  | "pier"
  | "slipway"
  | "boat_rental"
  | "cafe"
  | "playground";

/** OSM selector per kind, in the order they are shown. */
const SELECTORS: Record<AmenityKind, string> = {
  toilets: 'nwr["amenity"="toilets"]',
  shower: 'nwr["amenity"="shower"]',
  drinking_water: 'nwr["amenity"="drinking_water"]',
  bbq: 'nwr["amenity"="bbq"]',
  picnic_table: 'nwr["leisure"="picnic_table"]',
  shelter: 'nwr["amenity"="shelter"]',
  pier: 'nwr["man_made"="pier"]',
  slipway: 'nwr["leisure"="slipway"]',
  boat_rental: 'nwr["amenity"="boat_rental"]',
  cafe: 'nwr["amenity"="cafe"]',
  playground: 'nwr["leisure"="playground"]',
};

export const AMENITY_KINDS = Object.keys(SELECTORS) as AmenityKind[];

/** kind -> how many were found within the radius. Kinds with none are absent, not zero. */
export type ParkAmenities = Partial<Record<AmenityKind, number>>;

export interface OverpassAmenityElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export function buildAmenityQuery(
  parks: ReadonlyArray<{ lat: number; lng: number }>,
  radiusM = AMENITY_RADIUS_M,
): string {
  const clauses: string[] = [];
  for (const park of parks) {
    for (const selector of Object.values(SELECTORS)) {
      clauses.push(`${selector}(around:${radiusM},${park.lat.toFixed(5)},${park.lng.toFixed(5)});`);
    }
  }
  return `[out:json][timeout:120];\n(\n  ${clauses.join("\n  ")}\n);\nout tags center;`;
}

/** Which kind an element is, or null when it matched nothing we asked for. */
export function kindOf(tags: Record<string, string> | undefined): AmenityKind | null {
  if (!tags) return null;
  if (tags.amenity === "toilets") return "toilets";
  if (tags.amenity === "shower") return "shower";
  if (tags.amenity === "drinking_water") return "drinking_water";
  if (tags.amenity === "bbq") return "bbq";
  if (tags.leisure === "picnic_table") return "picnic_table";
  if (tags.amenity === "shelter") return "shelter";
  if (tags.man_made === "pier") return "pier";
  if (tags.leisure === "slipway") return "slipway";
  if (tags.amenity === "boat_rental") return "boat_rental";
  if (tags.amenity === "cafe") return "cafe";
  if (tags.leisure === "playground") return "playground";
  return null;
}

function coords(el: OverpassAmenityElement): { lat: number; lng: number } | null {
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/**
 * Count amenities per park, assigning each feature to the NEAREST park in range.
 *
 * Search circles overlap where two parks sit on the same lake, and one restroom block
 * belongs to one of them, not to both.
 */
export function groupAmenitiesByPark(
  elements: OverpassAmenityElement[],
  parks: ReadonlyArray<{ id: string; lat: number; lng: number }>,
  radiusM = AMENITY_RADIUS_M,
): Map<string, ParkAmenities> {
  const out = new Map<string, ParkAmenities>();
  const radiusKm = radiusM / 1000;

  for (const el of elements ?? []) {
    const kind = kindOf(el.tags);
    if (!kind) continue;
    // A private or staff-only facility is not an amenity for a visitor.
    if (el.tags?.access === "private" || el.tags?.access === "no") continue;
    const at = coords(el);
    if (!at) continue;

    let best: { id: string; km: number } | null = null;
    for (const park of parks) {
      const km = haversineKm(park.lat, park.lng, at.lat, at.lng);
      if (km <= radiusKm && (!best || km < best.km)) best = { id: park.id, km };
    }
    if (!best) continue;

    const bucket = out.get(best.id) ?? {};
    bucket[kind] = (bucket[kind] ?? 0) + 1;
    out.set(best.id, bucket);
  }
  return out;
}
