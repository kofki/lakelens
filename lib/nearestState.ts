/**
 * Which state the reader is in, inferred from the parks themselves.
 *
 * There is no geocoder in the browser and reverse-geocoding a visitor's coordinates on
 * every page load would be a request to a third party about where a person is. The parks
 * are already on the page with their coordinates and their state, so the nearest one
 * answers the question without telling anyone anything.
 *
 * It is a default, not a claim. Someone twenty miles over a border gets their neighbour's
 * state and one tap fixes it, which is a better first screen than the whole country.
 */
import { haversineKm, type LatLng } from "./distance";

/**
 * Beyond this, the nearest park is not evidence of anything.
 *
 * Someone in Hawaii is nearer to a California park than to anything else on the mainland,
 * and defaulting them to California would hide every park they can actually drive to. When
 * nothing is within range the filter stays off and the whole country is shown.
 */
export const MAX_INFERENCE_KM = 320;

export interface StatePoint {
  state?: string | null;
  lat: number;
  lng: number;
}

export function nearestState(location: LatLng | null | undefined, points: readonly StatePoint[]): string | null {
  if (!location) return null;
  let best: { state: string; km: number } | null = null;
  for (const point of points) {
    if (!point.state) continue;
    const km = haversineKm(location, { lat: point.lat, lng: point.lng });
    if (!best || km < best.km) best = { state: point.state, km };
  }
  if (!best || best.km > MAX_INFERENCE_KM) return null;
  return best.state;
}
