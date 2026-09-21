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

/** [slug, name, lat, lng, level index] */
export type MapPoint = [string, string, number, number, number];

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

/**
 * How many pins the map will accept at once.
 *
 * Past this the map is a texture rather than a set of places, and the payload stops being
 * free.
 */
export const MAX_POINTS = 400;

/** Cells per side of the sampling grid. 20 x 20 gives 400 cells for 400 pins. */
const GRID = 20;

/**
 * Keep a sample spread across the whole viewport.
 *
 * The first version kept the pins nearest the centre, on the theory that attention on a map
 * decays outward. That is true of where people look and false as a way to choose what to
 * draw: zoomed out to the whole country, the centre is Kansas, and Florida and Maine fell
 * off the map entirely. A reader cannot look at what is not there.
 *
 * So the viewport is divided into a grid and the sample is taken round-robin across the
 * cells. Every part of the screen that has parks keeps some, dense regions thin out first,
 * and an empty cell costs nothing.
 */
export function spreadAcross<T extends { lat: number; lng: number }>(
  items: readonly T[],
  bbox: Bbox,
  limit = MAX_POINTS,
): T[] {
  if (items.length <= limit) return [...items];
  const [west, south, east, north] = bbox;
  const latSpan = north - south || 1;
  const lngSpan = east - west || 1;

  const cells = new Map<number, T[]>();
  for (const item of items) {
    const row = Math.min(GRID - 1, Math.max(0, Math.floor(((item.lat - south) / latSpan) * GRID)));
    const col = Math.min(GRID - 1, Math.max(0, Math.floor(((item.lng - west) / lngSpan) * GRID)));
    const key = row * GRID + col;
    const bucket = cells.get(key);
    if (bucket) bucket.push(item);
    else cells.set(key, [item]);
  }

  // Round-robin: one from each occupied cell, then a second from each, until full. A cell
  // with forty lakes gives up the same first pin as a cell with one.
  const buckets = [...cells.values()];
  const out: T[] = [];
  for (let depth = 0; out.length < limit; depth += 1) {
    let placed = false;
    for (const bucket of buckets) {
      if (depth >= bucket.length) continue;
      out.push(bucket[depth]!);
      placed = true;
      if (out.length >= limit) break;
    }
    if (!placed) break;
  }
  return out;
}
