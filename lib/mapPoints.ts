/**
 * The map's own data: one small tuple per park, for the viewport being looked at.
 *
 * The map used to receive the same full card payload the list did, for every park in the
 * country. That was 123 bytes gzipped per park, which was fine at 616 parks, tolerable at
 * 2,107, and 1.95 MB once the lake harvest found 22,679 of them. Nobody waits for that.
 *
 * A pin needs four things: where it is, what colour it is, what to call it in a screen
 * reader, and where to go when it is tapped. Everything else about a park is fetched when
 * one is actually selected.
 *
 * Sent as a tuple rather than an object because the key names would otherwise be most of
 * the bytes: `{"slug":…,"lat":…,"lng":…,"level":…}` is 30 characters of punctuation per
 * park before any data.
 */
import type { StatusLevel } from "./types";

/** Index into LEVELS. A single digit on the wire instead of "closed_seasonal". */
export const LEVELS: readonly StatusLevel[] = ["open", "full", "closed", "unknown"];

/**
 * One park: [slug, name, lat, lng, level index].
 *
 * Or a grid cell holding several: ["", "", lat, lng, level index, count, closed]. Cells come
 * from the database's map_grid(), which is what lets a zoomed-out map account for every
 * park without shipping every park.
 */
export type MapPoint =
  | [string, string, number, number, number]
  | [string, string, number, number, number, number, number];

/** How many parks a point stands for: 1 for a park, the count for a cell. */
export function pointCount(point: MapPoint): number {
  return point.length > 5 ? (point[5] ?? 1) : 1;
}

/** Closed parks inside a cell, or 1/0 for a single park by its own level. */
export function pointClosed(point: MapPoint): number {
  if (point.length > 5) return point[6] ?? 0;
  return levelFromIndex(point[4]) === "closed" ? 1 : 0;
}

/**
 * Cells per side of the viewport grid the database buckets parks into.
 *
 * 64 across a phone-width map is a cell every six or so pixels, well under the 56 px the
 * client merges within, so the grid never decides what the reader sees; supercluster does,
 * with the grid only keeping the payload to a few hundred rows at any zoom.
 */
export const MAP_GRID = 64;

/** The grid's cell size in degrees for a viewport, floored so a street-level zoom still buckets. */
export function gridCellDeg(bbox: Bbox): number {
  const [west, south, east, north] = bbox;
  return Math.max((east - west) / MAP_GRID, (north - south) / MAP_GRID, 1e-4);
}

/** Integer cell coordinates, matching map_grid()'s floor(coord / cell). */
export function cellKey(lat: number, lng: number, cell: number): string {
  return `${Math.floor(lng / cell)}:${Math.floor(lat / cell)}`;
}

export interface MapPointsResult {
  points: MapPoint[];
  /** How many parks are in the viewport in total, which may exceed what was returned. */
  total: number;
  /** True when `points` was cut short, so the map can say "zoom in to see the rest". */
  truncated: boolean;
}

/**
 * Coordinates are rounded to five decimals, about a metre.
 *
 * Anything finer is noise on a lake and costs three characters a park.
 */
export function roundCoord(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}

export function levelIndex(level: StatusLevel): number {
  const i = LEVELS.indexOf(level);
  return i === -1 ? LEVELS.indexOf("unknown") : i;
}

export function levelFromIndex(index: number): StatusLevel {
  return LEVELS[index] ?? "unknown";
}

/** A viewport, as the map reports it: [west, south, east, north]. */
export type Bbox = [number, number, number, number];

export function parseBbox(raw: string | null): Bbox | null {
  if (!raw) return null;
  const parts = raw.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [west, south, east, north] = parts as Bbox;
  // A viewport with no area returns nothing useful, and south above north is a client bug.
  if (south >= north || west >= east) return null;
  return [west, south, east, north];
}
