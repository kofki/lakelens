/**
 * lib/distance.ts — geodesic distance, unit conversion, drive-time estimate and the
 * "wheelchair-accessible water entry" predicate shared by filters and backups.
 * Pure TS: no React / Next / DOM imports.
 */
import type { Accessibility } from "./types";

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371.0088;
const KM_PER_MILE = 1.609344;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in kilometres (haversine formula). */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function kmToMiles(km: number): number {
  return km / KM_PER_MILE;
}

/**
 * Rough drive time in whole minutes at an average speed (default 45 mph ≈ 72.4 km/h).
 * This is a straight-line estimate, so callers should label it as an estimate.
 */
export function driveMinutes(km: number, mph = 45): number {
  if (!Number.isFinite(km) || km <= 0 || !Number.isFinite(mph) || mph <= 0) return 0;
  const kmh = mph * KM_PER_MILE;
  return Math.round((km / kmh) * 60);
}

/**
 * "Wheelchair-accessible water entry" filter predicate:
 * (water_access in (yes, limited) AND entry_type in (ramp, dock_ladder)) OR wheelchair_loaner === true.
 * Unknown / missing accessibility rows never pass (we do not guess).
 */
export function isAccessibleEntry(a: Accessibility | null | undefined): boolean {
  if (!a) return false;
  if (a.wheelchair_loaner === true) return true;
  const waterOk = a.water_access === "yes" || a.water_access === "limited";
  const entryOk = a.entry_type === "ramp" || a.entry_type === "dock_ladder";
  return waterOk && entryOk;
}
