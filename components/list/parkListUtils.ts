/**
 * Pure helpers shared by the map sheet and /list: distance annotation, filtering
 * (incl. the accessible-entry predicate from lib/distance), sorting, counts and
 * plain-language labels. No React imports so they can be unit-tested in node.
 */
import type { Filters, Park, ParkWithStatus, StatusLevel, StatusSource } from "@/lib/types";
import { STATUS_ORDER } from "@/lib/status";
import { haversineKm, isAccessibleEntry, kmToMiles, type LatLng } from "@/lib/distance";
import { normalizeStateCode, stateName } from "@/lib/states";

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

/** Applies the contract filters and the state narrowing, plus an optional name search (case-insensitive substring). */
export function filterParks(items: ParkWithStatus[], filters: Filters, query = ""): ParkWithStatus[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (filters.accessibleEntry && !isAccessibleEntry(item.accessibility)) return false;
    if (filters.guardedOnly && item.park.guarded !== "yes") return false;
    if (filters.state && normalizeStateCode(item.park.state) !== filters.state) return false;
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
  return Number(filters.accessibleEntry) + Number(filters.guardedOnly) + Number(filters.state != null);
}

export interface StateOption {
  code: string;
  name: string;
}

/**
 * The states the current data actually covers, by full name. Offering all fifty would
 * promise coverage we do not have, so the menu is derived from the parks in hand.
 */
export function availableStates(items: ParkWithStatus[]): StateOption[] {
  const seen = new Map<string, string>();
  for (const item of items) {
    const code = normalizeStateCode(item.park.state);
    if (!code || seen.has(code)) continue;
    const name = stateName(code);
    if (name) seen.set(code, name);
  }
  return [...seen].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export interface StateGroup extends StateOption {
  items: ParkWithStatus[];
}

export interface GroupedParks {
  groups: StateGroup[];
  /** Parks whose state is missing or unrecognised: they belong under no heading. */
  ungrouped: ParkWithStatus[];
}

/**
 * Single pass over an already-sorted list, so each group keeps that sort order and the
 * caller can slice to a render cap before grouping without the groups shifting around.
 */
/**
 * Below this, a state does not get its own heading.
 *
 * The tile cap is 40 and there are 51 states, so a nationwide list produced a heading with
 * a single card under it over and over: a page of section titles rather than a page of
 * parks. A heading has to earn its vertical space by organising something.
 */
export const MIN_GROUP_SIZE = 3;

export function groupParksByState(items: ParkWithStatus[], minGroupSize = MIN_GROUP_SIZE): GroupedParks {
  const byCode = new Map<string, StateGroup>();
  const ungrouped: ParkWithStatus[] = [];
  for (const item of items) {
    const code = normalizeStateCode(item.park.state);
    const name = code ? stateName(code) : null;
    if (!code || !name) {
      ungrouped.push(item);
      continue;
    }
    const group = byCode.get(code);
    if (group) group.items.push(item);
    else byCode.set(code, { code, name, items: [item] });
  }
  const groups: StateGroup[] = [];
  for (const group of byCode.values()) {
    // Too few to organise: those cards go in with the rest rather than each getting a
    // heading of their own.
    if (group.items.length < minGroupSize) ungrouped.push(...group.items);
    else groups.push(group);
  }
  groups.sort((a, b) => a.name.localeCompare(b.name));
  return { groups, ungrouped };
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

const TYPE_LABEL: Record<Park["type"], string> = { spring: "Spring", lake: "Lake", river: "River" };
const OPERATOR_LABEL: Record<Park["operator"], string> = {
  state: "State park",
  county: "County park",
  private: "Privately run",
};

/**
 * "Spring · Gainesville, FL", or "Spring · State park" where the town is unknown.
 *
 * The operator used to hold the second slot unconditionally. With parks across more than
 * twenty states, "Blue Lake Beach · County park" gives a reader no way to tell whether it
 * is an hour away or a thousand miles, and who runs a park is a question for its own page.
 * Where we know the town, the town wins.
 */
export function describeParkKind(park: Pick<Park, "type" | "operator" | "city" | "state">): string {
  const kind = TYPE_LABEL[park.type] ?? park.type;
  return `${kind} · ${parkLocation(park) ?? OPERATOR_LABEL[park.operator] ?? park.operator}`;
}

/**
 * "Gainesville, FL", falling back to the state alone.
 *
 * A town with no state is not returned: there is a Springfield in most of them, so the name
 * on its own locates nothing.
 */
export function parkLocation(park: Pick<Park, "city" | "state">): string | null {
  if (park.city && park.state) return `${park.city}, ${park.state}`;
  return park.state ?? null;
}

/** Plain-language source for the status "last updated" line. */
export function statusSourceLabel(source: StatusSource): string {
  switch (source) {
    case "alert":
      return "Official notice";
    case "hours":
      return "Park hours";
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
