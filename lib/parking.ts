/**
 * Pure helpers for the parking map. Kept out of the component so they can be tested
 * without pulling maplibre-gl and its stylesheet into the test run.
 */
import type { ParkingLot } from "./types";

export interface LatLngLike {
  lat: number;
  lng: number;
}

/** One line describing a lot: fee, size, accessible spaces, overflow. Empty when unknown. */
export function lotSummary(lot: Pick<ParkingLot, "fee" | "capacity" | "ada_spaces" | "is_overflow">): string {
  const bits: string[] = [];
  if (lot.fee) bits.push(lot.fee);
  if (lot.capacity != null) bits.push(`about ${lot.capacity} spaces`);
  if (lot.ada_spaces != null && lot.ada_spaces > 0) bits.push(`${lot.ada_spaces} accessible spaces`);
  if (lot.is_overflow) bits.push("overflow lot");
  return bits.join(" · ");
}

/**
 * Bounding box around the park and every lot, so the map opens with all of them in view.
 *
 * Includes the park itself, not just the lots: at an island or reef park the centroid is
 * offshore and the lots are on the mainland, and showing only the lots would hide the
 * reason they are that far away.
 */
export function parkingBounds(
  center: LatLngLike,
  lots: ReadonlyArray<LatLngLike>,
): [[number, number], [number, number]] {
  let west = center.lng;
  let east = center.lng;
  let south = center.lat;
  let north = center.lat;
  for (const lot of lots) {
    west = Math.min(west, lot.lng);
    east = Math.max(east, lot.lng);
    south = Math.min(south, lot.lat);
    north = Math.max(north, lot.lat);
  }
  return [
    [west, south],
    [east, north],
  ];
}
