/**
 * Pure helpers shared by the map sheet and /list: distance annotation, filtering
 * (incl. the accessible-entry predicate from lib/distance), sorting, counts and
 * plain-language labels. No React imports so they can be unit-tested in node.
 */
import type { Filters, Park, ParkWithStatus, StatusLevel, StatusSource } from "@/lib/types";
import { STATUS_ORDER } from "@/lib/status";
import { haversineKm, isAccessibleEntry, kmToMiles, type LatLng } from "@/lib/distance";

export type { LatLng };

export type SortKey = "distance" | "status" | "name";
export const SORT_KEYS: readonly SortKey[] = ["distance", "status", "name"];

export function isSortKey(value: unknown): value is SortKey {
  return typeof value === "string" && (SORT_KEYS as readonly string[]).includes(value);
}

/** Copies items with `distanceKm` filled from the user's location (leaves them untouched without one). */
export function withDistances(items: ParkWithStatus[], location: LatLng | null | undefined): ParkWithStatus[] {
  if (!location) return items;
  return items.map((item) => ({
    ...item,
    distanceKm: haversineKm(location, { lat: item.park.lat, lng: item.park.lng }),
  }));
}

/** Applies the three contract filters plus an optional name search (case-insensitive substring). */
export function filterParks(items: ParkWithStatus[], filters: Filters, query = ""): ParkWithStatus[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (filters.accessibleEntry && !isAccessibleEntry(item.accessibility)) return false;
    if (filters.guardedOnly && item.park.guarded !== "yes") return false;
    if (q && !item.park.name.toLowerCase().includes(q)) return false;
    return true;
  });
}

const STATUS_RANK: Record<StatusLevel, number> = STATUS_ORDER.reduce(
  (acc, level, i) => {
    acc[level] = i;
    return acc;
  },
  {} as Record<StatusLevel, number>,
);

function byName(a: ParkWithStatus, b: ParkWithStatus): number {
  return a.park.name.localeCompare(b.park.name);
}

function byDistance(a: ParkWithStatus, b: ParkWithStatus): number {
  return (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY);
}

/** Stable sort. distance: nearest first (unknown last); status: open → full → closed → unknown. */
export function sortParks(items: ParkWithStatus[], sort: SortKey): ParkWithStatus[] {
  const arr = [...items];
  switch (sort) {
    case "distance":
      arr.sort((a, b) => byDistance(a, b) || byName(a, b));
      break;
    case "status":
      arr.sort((a, b) => STATUS_RANK[a.status.level] - STATUS_RANK[b.status.level] || byDistance(a, b) || byName(a, b));
      break;
    default:
      arr.sort(byName);
  }
  return arr;
}

export function activeFilterCount(filters: Filters): number {
  return Number(filters.accessibleEntry) + Number(filters.guardedOnly);
}

export interface StatusCounts {
  shown: number;
  open: number;
  full: number;
  closed: number;
  unknown: number;
}

export function countStatuses(items: ParkWithStatus[]): StatusCounts {
  const c: StatusCounts = { shown: items.length, open: 0, full: 0, closed: 0, unknown: 0 };
  for (const item of items) {
    switch (item.status.level) {
      case "open":
        c.open++;
        break;
      case "full":
        c.full++;
        break;
      case "closed":
        c.closed++;
        break;
      default:
        c.unknown++;
    }
  }
  return c;
}

/** "12 parks shown, 3 full, 2 closed": read by the live region and shown in the sheet header. */
export function countsMessage(c: StatusCounts): string {
  const parts = [`${c.shown} ${c.shown === 1 ? "park" : "parks"} shown`];
  if (c.open) parts.push(`${c.open} open`);
  if (c.full) parts.push(`${c.full} full`);
  if (c.closed) parts.push(`${c.closed} closed`);
  return parts.join(", ");
}

/** "0.8 mi" under 10 miles, otherwise whole miles; null when distance is unknown. */
export function formatDistance(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km)) return null;
  const miles = kmToMiles(km);
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

const TYPE_LABEL: Record<Park["type"], string> = { spring: "Spring", lake: "Lake", river: "River", beach: "Beach" };
const OPERATOR_LABEL: Record<Park["operator"], string> = {
  state: "State park",
  county: "County park",
  private: "Privately run",
};

/** "Spring · State park" */
export function describeParkKind(park: Pick<Park, "type" | "operator">): string {
  return `${TYPE_LABEL[park.type] ?? park.type} · ${OPERATOR_LABEL[park.operator] ?? park.operator}`;
}

/** Plain-language source for the status "last updated" line. */
export function statusSourceLabel(source: StatusSource): string {
  switch (source) {
    case "alert":
      return "Official notice";
    case "seasonal":
      return "Swim season rules";
    case "confirmed_reports":
      return "Visitor reports";
    case "report_prediction":
      return "Reports + estimate";
    case "prediction":
      return "Estimate";
    default:
      return "No data yet";
  }
}

export function hasSampleReports(items: ParkWithStatus[]): boolean {
  return items.some((item) => item.reportSummary.sampleCount > 0);
}
