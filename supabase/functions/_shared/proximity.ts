/**
 * How much to trust that a report came from the place it describes.
 *
 * A report says "the lot is full right now". That is only worth anything from someone who
 * is there, so where the reporter was is the single most useful thing we can know about a
 * report beyond its content.
 *
 * It is deliberately NOT a gate. Browser geolocation is supplied by the client and anyone
 * who wants to lie about it can, so refusing reports on it buys no real protection, and it
 * does reliably block honest people: location switched off, a VPN, a phone with no signal
 * in a river valley, a tablet with no GPS at all. Those are exactly the people standing at
 * a full car park with something to tell you.
 *
 * So proximity ranks rather than rejects. An on-site report is badged and sorted first; an
 * unplaced one still posts and still counts, lower.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

/**
 * Great-circle distance. Duplicated from lib/distance.ts rather than imported, because an
 * Edge Function cannot reach into the Next app's module graph and this is eight lines.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type ReportOrigin = "on_site" | "nearby" | "in_state" | "remote" | "unplaced";

export interface ProximityVerdict {
  origin: ReportOrigin;
  /** Distance to the park, or null when the reporter gave no location. */
  distanceKm: number | null;
  /** Whether to badge this report as coming from the park itself. */
  onSite: boolean;
}

/**
 * Within this, the reporter is at the park.
 *
 * 2 km rather than something tighter because a park is not a point: our coordinate is one
 * spot on a lake that can be several kilometres across, and the overflow lot people are
 * reporting on is by definition at the far edge of it.
 */
export const ON_SITE_KM = 2;
/** Close enough to be passing, arriving or turning back. Still a useful report. */
export const NEARBY_KM = 25;
/** Beyond this the reporter is not having an experience of this park today. */
export const IN_STATE_KM = 400;

export function classifyOrigin(reporter: LatLng | null | undefined, park: LatLng): ProximityVerdict {
  if (
    !reporter ||
    !Number.isFinite(reporter.lat) ||
    !Number.isFinite(reporter.lng) ||
    (reporter.lat === 0 && reporter.lng === 0)
  ) {
    // (0, 0) is in the Atlantic. It is what a broken client sends, never where anyone is.
    return { origin: "unplaced", distanceKm: null, onSite: false };
  }

  const distanceKm = haversineKm(reporter, park);
  if (distanceKm <= ON_SITE_KM) return { origin: "on_site", distanceKm, onSite: true };
  if (distanceKm <= NEARBY_KM) return { origin: "nearby", distanceKm, onSite: false };
  if (distanceKm <= IN_STATE_KM) return { origin: "in_state", distanceKm, onSite: false };
  return { origin: "remote", distanceKm, onSite: false };
}

/**
 * Weight for ranking and for the "N people said this" count.
 *
 * A remote report is kept and shown, because someone may be reporting a closure they were
 * told about, and silently discarding what a person took the trouble to send is worse than
 * ranking it low. It just cannot outvote someone standing there.
 */
export function originWeight(origin: ReportOrigin): number {
  switch (origin) {
    case "on_site":
      return 1;
    case "nearby":
      return 0.6;
    case "unplaced":
      return 0.4;
    case "in_state":
      return 0.25;
    case "remote":
      return 0.1;
  }
}

/** Short label for the badge. Null where there is nothing worth saying. */
export function originLabel(origin: ReportOrigin): string | null {
  switch (origin) {
    case "on_site":
      return "At the park";
    case "nearby":
      return "Nearby";
    case "remote":
      return "Far away";
    default:
      return null;
  }
}
