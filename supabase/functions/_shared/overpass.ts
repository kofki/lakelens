/**
 * OpenStreetMap parking lots via the Overpass API.
 *
 * Previously this ran as a seed-time script whose raw response was committed to
 * data/osm-cache/. That made OSM's parking data a build artifact: a lot added to OSM
 * never reached the app until someone re-ran the script and re-seeded. Here the same
 * query runs on a schedule inside Supabase, so `parking_lots` tracks OSM on its own.
 *
 * Overpass fair use is roughly 100 queries a day for an application, so this must stay
 * a single batched query on a slow schedule (weekly): never a per-park or per-request call.
 *
 * Pure parsing lives here so vitest can exercise it against fixtures; the Edge Function
 * owns the fetching and the writes.
 */
import { haversineKm } from "./gauges.ts";

/**
 * Mirrors of the Overpass API, in the order they are tried. Which mirror is healthy
 * changes week to week: lz4 was the only one answering in September 2026 and was
 * returning 504 by the time this job was written: so the list matters less than
 * moving on quickly when one is down.
 */
export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
] as const;

/**
 * How far from a park's centre a lot may sit and still plausibly be "this park's parking".
 *
 * The seed-time script used 2 km, which was fine for seven rural springs but catches
 * supermarkets and office lots around the urban parks in the full 84-park set: a 24-park
 * sweep at 2 km returned 409 lots. A kilometre keeps the walk-to-the-water lots.
 */
export const PARKING_RADIUS_M = 1000;

/** Most lots a single park can contribute, nearest first. */
export const MAX_LOTS_PER_PARK = 6;

/**
 * `parking` values that are not "a lot you leave the car in and walk to the water".
 * Street-side and lane parking is roadway, not a lot, and the park pages already warn
 * about roadside waiting.
 */
const EXCLUDED_PARKING_KINDS = new Set(["street_side", "lane", "on_street"]);

export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  elements?: OverpassElement[];
  /** Set when at least one chunk failed: the caller must not prune on a partial result. */
  partial?: boolean;
  failures?: string[];
}

/** A row ready for public.parking_lots (source 'osm'). */
export interface ParkingLotInsert {
  park_id: string;
  name: string;
  lat: number;
  lng: number;
  fee: string | null;
  capacity: number | null;
  ada_spaces: number | null;
  is_overflow: boolean;
  source: "osm";
  notes: string | null;
  /** "node/123": stable OSM identity, so a re-run updates rather than duplicates. */
  osm_ref: string;
}

/** One `nwr[amenity=parking](around:…)` clause per park, in a single query. */
export function buildParkingQuery(parks: ReadonlyArray<{ lat: number; lng: number }>, radiusM = PARKING_RADIUS_M): string {
  const clauses = parks
    .map((p) => `nwr["amenity"="parking"](around:${radiusM},${p.lat.toFixed(5)},${p.lng.toFixed(5)});`)
    .join("\n  ");
  return `[out:json][timeout:90];\n(\n  ${clauses}\n);\nout center;`;
}

function coords(el: OverpassElement): { lat: number; lng: number } | null {
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function intTag(tags: Record<string, string>, key: string): number | null {
  const raw = tags[key];
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** OSM's fee/charge tags in the wording the parking card already uses. */
export function describeFee(tags: Record<string, string>): string | null {
  const fee = (tags.fee ?? "").toLowerCase();
  if (fee === "no") return "Free";
  if (fee === "yes") return tags.charge ?? "Paid";
  return null;
}

/** Surface and access notes worth showing, joined into one sentence. */
export function describeNotes(tags: Record<string, string>): string | null {
  const parts: string[] = [];
  if (tags.surface) parts.push(`${tags.surface.replace(/_/g, " ")} surface`);
  if (tags.access && tags.access !== "yes" && tags.access !== "public") parts.push(`access: ${tags.access}`);
  if (tags.parking) parts.push(tags.parking.replace(/_/g, " "));
  return parts.length > 0 ? parts.join(" \u00b7 ") : null;
}

/**
 * Assign each parking element to the nearest park within the radius.
 *
 * Overpass returns one flat list for a batched query, and the search circles of nearby
 * parks overlap, so a lot has to be claimed by exactly one park or it appears twice.
 */
export function groupParkingByPark(
  response: OverpassResponse,
  /** Only identity and position matter here, so callers can pass a narrow park row. */
  parks: ReadonlyArray<{ id: string; lat: number; lng: number }>,
  radiusM = PARKING_RADIUS_M,
): ParkingLotInsert[] {
  const byPark = new Map<string, { row: ParkingLotInsert; km: number }[]>();
  const radiusKm = radiusM / 1000;

  for (const el of response.elements ?? []) {
    const at = coords(el);
    if (!at) continue;
    const tags = el.tags ?? {};
    // Not public parking, or not a lot at all.
    if (tags.access === "private" || tags.access === "no" || tags.access === "customers") continue;
    if (tags.parking && EXCLUDED_PARKING_KINDS.has(tags.parking)) continue;

    let best: { park: { id: string; lat: number; lng: number }; km: number } | null = null;
    for (const park of parks) {
      const km = haversineKm(park.lat, park.lng, at.lat, at.lng);
      if (km <= radiusKm && (!best || km < best.km)) best = { park, km };
    }
    if (!best) continue;

    const row: ParkingLotInsert = {
      park_id: best.park.id,
      name: tags.name ?? "Parking area (OpenStreetMap)",
      lat: at.lat,
      lng: at.lng,
      fee: describeFee(tags),
      capacity: intTag(tags, "capacity"),
      ada_spaces: intTag(tags, "capacity:disabled"),
      is_overflow: false,
      source: "osm",
      notes: describeNotes(tags),
      osm_ref: `${el.type}/${el.id}`,
    };
    const list = byPark.get(best.park.id) ?? [];
    list.push({ row, km: best.km });
    byPark.set(best.park.id, list);
  }

  const out: ParkingLotInsert[] = [];
  for (const list of byPark.values()) {
    list.sort((a, b) => a.km - b.km);
    for (const { row } of list.slice(0, MAX_LOTS_PER_PARK)) out.push(row);
  }
  return out;
}

export interface FetchParkingOptions {
  fetchImpl?: typeof fetch;
  userAgent?: string;
  timeoutMs?: number;
  /** Parks per Overpass query. The whole state in one go times the mirrors out. */
  chunkSize?: number;
  /**
   * Stop starting new chunks after this long. The Edge Function runtime kills a request
   * at 150 s, and a run that is killed reports nothing at all, so a partial result the
   * caller knows is partial is strictly better.
   */
  deadlineMs?: number;
}

/** Contact address, as Overpass's usage policy asks for. */
export const OVERPASS_USER_AGENT = "LakeLens/1.0 (https://github.com/kofki/lakelens; kenzof28@gmail.com)";

/** Overpass asks for a gap between queries from the same client. */
const CHUNK_GAP_MS = 1_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function postOverpass(
  parks: ReadonlyArray<{ lat: number; lng: number }>,
  opts: FetchParkingOptions,
): Promise<OverpassResponse> {
  const doFetch = opts.fetchImpl ?? fetch;
  // Overpass answers 406 unless the body is a pre-encoded form string.
  const body = new URLSearchParams({ data: buildParkingQuery(parks) }).toString();
  const errors: string[] = [];
  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await doFetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            // Overpass turns anonymous clients away with an HTML error page.
            "User-Agent": opts.userAgent ?? OVERPASS_USER_AGENT,
            Accept: "application/json",
          },
          body,
          signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
        });
        if (!res.ok) {
          errors.push(`${endpoint}: HTTP ${res.status}`);
          // 429/504 are load, not a bad request: worth one retry on the same mirror.
          if (res.status === 429 || res.status === 504) {
            await sleep(3_000);
            continue;
          }
          break;
        }
        return (await res.json()) as OverpassResponse;
      } catch (err) {
        errors.push(`${endpoint}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  throw new Error(`overpass unavailable (${errors.join("; ")})`);
}

/**
 * Parking elements around every park, in chunked batched queries.
 *
 * One clause per park in a single query is the cheapest thing for Overpass, but all 84
 * at a 2 km radius exceeds what the public mirrors will finish inside their gateway
 * timeout, so this walks the list in chunks and merges the results.
 */
export async function fetchParkingElements(
  parks: ReadonlyArray<{ lat: number; lng: number }>,
  opts: FetchParkingOptions = {},
): Promise<OverpassResponse> {
  const chunkSize = Math.max(1, opts.chunkSize ?? 12);
  const startedAt = Date.now();
  const deadlineMs = opts.deadlineMs ?? 100_000;
  const byKey = new Map<string, OverpassElement>();
  const failures: string[] = [];
  let succeeded = 0;

  for (let i = 0; i < parks.length; i += chunkSize) {
    if (Date.now() - startedAt > deadlineMs) {
      failures.push(`deadline reached after ${i} of ${parks.length} parks`);
      break;
    }
    const chunk = parks.slice(i, i + chunkSize);
    try {
      const res = await postOverpass(chunk, opts);
      succeeded++;
      for (const el of res.elements ?? []) byKey.set(`${el.type}/${el.id}`, el);
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
    }
    if (i + chunkSize < parks.length) await sleep(CHUNK_GAP_MS);
  }

  // Every chunk failing means Overpass is down, not that Florida has no parking.
  if (succeeded === 0) throw new Error(failures[0] ?? "overpass unavailable");
  return { elements: [...byKey.values()], partial: failures.length > 0, failures };
}
