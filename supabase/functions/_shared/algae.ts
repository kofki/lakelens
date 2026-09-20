/**
 * FDEP algal bloom sampling -> park_alerts(kind=notice, source=fdep-algae).
 *
 * Source (verified live 2026-09-19): the Florida DEP "Florida Algal Bloom Site Visits" layer behind the
 * public Algal Bloom Dashboard (https://floridadep.gov/AlgalBloom), published on ArcGIS Online as a
 * public FeatureServer (Query capability, WGS84, maxRecordCount 5000, ~100 samples per 21 days):
 *   https://services1.arcgis.com/nRHtyn3uE1kyzoYc/arcgis/rest/services/AlgalBloom_Final_View/FeatureServer/0/query
 *     ?where=SampleDateTime >= TIMESTAMP '<since>'&outFields=...&outSR=4326&f=json
 * Fields: SampleDateTime (epoch ms), esrignss_latitude/longitude, County, BloomObserved (Yes|No),
 * ToxinPresent (Yes|No|Pending), Microcystin (free text "0.33 I (...)" | "not detected" | "Pending"),
 * OtherToxin, CyanobacteriaDominant (Yes|No|Pending), AlgalIDResult, locationString, globalid.
 * Hub page: https://geodata.dep.state.fl.us/datasets/FDEP::florida-algal-bloom-site-visits-1/about
 *
 * Matching: a sample within ALGAE_MATCH_KM of a park's swim point that observed a bloom OR has toxin
 * results (present or pending) becomes a notice for that park, active while the sample is younger than
 * ALGAE_WINDOW_DAYS. Clean samples (no bloom, no toxin) are not alerts. Severity by toxin presence.
 * Runtime-neutral fetcher (injectable fetchImpl); hashing needs Node crypto (lib/ingest/hash).
 */
import { sha256Hex } from "./hash.ts";
import type { WaterQuality, WaterQualityLevel } from "./types.ts";

export const FDEP_ALGAE_QUERY_URL =
  "https://services1.arcgis.com/nRHtyn3uE1kyzoYc/arcgis/rest/services/AlgalBloom_Final_View/FeatureServer/0/query";
export const FDEP_ALGAE_DASHBOARD_URL = "https://floridadep.gov/AlgalBloom";
export const ALGAE_WINDOW_DAYS = 21;
/**
 * Radius for turning a sample into an ALERT for a park. Deliberately tight: an alert is a
 * claim about this swim area, not about the county.
 */
export const ALGAE_MATCH_KM = 3;

/**
 * Radius for the water-quality READING shown on the conditions grid.
 *
 * Wider than the alert radius because sampling sites sit at named water bodies and boat
 * ramps rather than at swim areas, so a 3 km rule matched zero parks statewide. The tile
 * always prints the distance, so a 12 km sample reads as what it is.
 */
export const WATER_QUALITY_MATCH_KM = 15;
export const ALGAE_SOURCE = "fdep-algae";

export type ToxinStatus = "yes" | "no" | "pending";

export interface AlgaeSample {
  /** globalid (stable across edits) */
  id: string;
  sampledAt: string; // ISO UTC
  lat: number;
  lng: number;
  county: string | null;
  location: string | null;
  bloomObserved: boolean;
  toxinPresent: ToxinStatus;
  microcystin: string | null;
  otherToxin: string | null;
  cyanobacteriaDominant: ToxinStatus;
  algalId: string | null;
}

export interface ArcgisFeature {
  attributes: Record<string, unknown>;
  geometry?: { x: number; y: number } | null;
}

export interface ArcgisQueryResponse {
  features?: ArcgisFeature[];
  exceededTransferLimit?: boolean;
  error?: { code: number; message: string };
}

const OUT_FIELDS = [
  "objectid",
  "globalid",
  "SampleDateTime",
  "County",
  "esrignss_latitude",
  "esrignss_longitude",
  "BloomObserved",
  "AlgalIDResult",
  "ToxinPresent",
  "Microcystin",
  "OtherToxin",
  "CyanobacteriaDominant",
  "locationString",
];

function sqlTimestamp(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export function buildAlgaeQueryUrl(since: Date): string {
  const params = new URLSearchParams({
    where: `SampleDateTime >= TIMESTAMP '${sqlTimestamp(since)}'`,
    outFields: OUT_FIELDS.join(","),
    outSR: "4326",
    returnGeometry: "true",
    resultRecordCount: "5000",
    f: "json",
  });
  return `${FDEP_ALGAE_QUERY_URL}?${params.toString()}`;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function yesNoPending(v: unknown): ToxinStatus {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "yes") return "yes";
  if (s === "pending") return "pending";
  return "no";
}

/** ArcGIS query JSON -> samples (drops rows without coordinates or a parseable date). */
export function normalizeAlgae(json: ArcgisQueryResponse): AlgaeSample[] {
  const out: AlgaeSample[] = [];
  for (const f of json?.features ?? []) {
    const a = f?.attributes ?? {};
    const lat = Number(a.esrignss_latitude ?? f.geometry?.y);
    const lng = Number(a.esrignss_longitude ?? f.geometry?.x);
    const ms = typeof a.SampleDateTime === "number" ? a.SampleDateTime : Date.parse(String(a.SampleDateTime ?? ""));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(ms)) continue;
    const id = str(a.globalid) ?? (a.objectid !== undefined ? `objectid:${a.objectid}` : null);
    if (!id) continue;
    out.push({
      id,
      sampledAt: new Date(ms).toISOString(),
      lat,
      lng,
      county: str(a.County),
      location: str(a.locationString),
      bloomObserved: String(a.BloomObserved ?? "").trim().toLowerCase() === "yes",
      toxinPresent: yesNoPending(a.ToxinPresent),
      microcystin: str(a.Microcystin),
      otherToxin: str(a.OtherToxin),
      cyanobacteriaDominant: yesNoPending(a.CyanobacteriaDominant),
      algalId: str(a.AlgalIDResult),
    });
  }
  return out;
}

/** Clean samples (no bloom seen, no toxin) are reassurance, not alerts. */
export function isAlertWorthy(s: AlgaeSample): boolean {
  return s.bloomObserved || s.toxinPresent !== "no";
}

/** Severity strings follow the NWS vocabulary already used in park_alerts.severity. */
export function algaeSeverity(s: AlgaeSample): "Severe" | "Moderate" | "Minor" {
  if (s.toxinPresent === "yes") return "Severe";
  if (s.toxinPresent === "pending") return "Moderate";
  return "Minor";
}

/** "0.33 I (I qualifier ...)" -> "0.33", "not detected" -> null */
export function microcystinValue(text: string | null): string | null {
  if (!text) return null;
  const m = text.match(/^\s*(\d+(?:\.\d+)?)/);
  return m ? m[1] : null;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
}

export function formatDistanceKm(km: number): string {
  if (km < 0.95) return "within 1 km";
  return `within ${Math.ceil(km)} km`;
}

/** "FDEP algal bloom sample within 2 km on Sep 12: microcystin detected (0.33 µg/L)" */
export function algaeAlertText(s: AlgaeSample, distanceKm: number): string {
  let status: string;
  if (s.toxinPresent === "yes") {
    const mc = microcystinValue(s.microcystin);
    const mcDetected = s.microcystin !== null && !/not detected|pending/i.test(s.microcystin);
    status = mcDetected ? `microcystin detected${mc ? ` (${mc} µg/L)` : ""}` : "algal toxin detected";
  } else if (s.toxinPresent === "pending") {
    status = s.bloomObserved ? "bloom observed, toxin results pending" : "toxin results pending";
  } else {
    status = "bloom observed, no toxin detected";
  }
  const where = s.location ? ` (${s.location})` : "";
  return `FDEP algal bloom sample ${formatDistanceKm(distanceKm)} on ${shortDate(s.sampledAt)}: ${status}${where}. Avoid water that looks scummy or discolored.`;
}

/** One row per (park, sample); park_id prefixed because park_alerts.hash is UNIQUE table-wide. */
export function algaeAlertHash(parkId: string, sampleId: string): string {
  return sha256Hex(`${parkId}|${ALGAE_SOURCE}|${sampleId}`);
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface AlgaeMatch<P> {
  park: P;
  sample: AlgaeSample;
  distanceKm: number;
}

/**
 * Alert-worthy samples younger than the window within `maxKm` of each park. Pure; `now` injectable.
 */
export function matchAlgaeToParks<P extends { lat: number; lng: number }>(
  samples: AlgaeSample[],
  parks: P[],
  now: Date,
  maxKm = ALGAE_MATCH_KM,
  windowDays = ALGAE_WINDOW_DAYS,
): AlgaeMatch<P>[] {
  const cutoff = now.getTime() - windowDays * 86400e3;
  const fresh = samples.filter((s) => isAlertWorthy(s) && Date.parse(s.sampledAt) >= cutoff && Date.parse(s.sampledAt) <= now.getTime() + 86400e3);
  const out: AlgaeMatch<P>[] = [];
  for (const park of parks) {
    for (const sample of fresh) {
      const km = haversineKm(park.lat, park.lng, sample.lat, sample.lng);
      if (km <= maxKm) out.push({ park, sample, distanceKm: Math.round(km * 10) / 10 });
    }
  }
  return out;
}

/** ISO end of the active window for a sample. */
export function algaeAlertEndsAt(sample: AlgaeSample, windowDays = ALGAE_WINDOW_DAYS): string {
  return new Date(Date.parse(sample.sampledAt) + windowDays * 86400e3).toISOString();
}

export interface FetchAlgaeOptions {
  fetchImpl?: typeof fetch;
  now?: Date;
  timeoutMs?: number;
  windowDays?: number;
}

export async function fetchAlgaeSamples(opts: FetchAlgaeOptions = {}): Promise<AlgaeSample[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - (opts.windowDays ?? ALGAE_WINDOW_DAYS) * 86400e3);
  const res = await fetchImpl(buildAlgaeQueryUrl(since), {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
  });
  if (!res.ok) throw new Error(`FDEP algae HTTP ${res.status}`);
  const json = (await res.json()) as ArcgisQueryResponse;
  if (json.error) throw new Error(`FDEP algae: ${json.error.message} (${json.error.code})`);
  return normalizeAlgae(json);
}


// ---------------------------------------------------------------------------
// Water quality reading (park_forecast.water_quality), as opposed to an alert
// ---------------------------------------------------------------------------

/** Closest sample to a park within `maxKm`, or null. */
export function nearestSample<P extends { lat: number; lng: number }>(
  samples: AlgaeSample[],
  park: P,
  maxKm = WATER_QUALITY_MATCH_KM,
): { sample: AlgaeSample; distanceKm: number } | null {
  let best: { sample: AlgaeSample; distanceKm: number } | null = null;
  for (const sample of samples) {
    const km = haversineKm(park.lat, park.lng, sample.lat, sample.lng);
    if (km <= maxKm && (!best || km < best.distanceKm)) best = { sample, distanceKm: Math.round(km * 10) / 10 };
  }
  return best;
}

/**
 * One sample to a three-step reading.
 *
 * "avoid" only when a toxin was actually detected or a bloom was seen, because this tile
 * sits next to a swim decision. A pending toxin result is "caution", never "clear": the
 * sample was taken for a reason.
 */
export function waterQualityLevelFor(s: AlgaeSample): WaterQualityLevel {
  if (s.toxinPresent === "yes" || s.bloomObserved) return "avoid";
  if (s.toxinPresent === "pending" || s.cyanobacteriaDominant === "yes") return "caution";
  return "clear";
}

const WATER_QUALITY_LABEL: Record<WaterQualityLevel, string> = {
  clear: "Clear",
  caution: "Caution",
  avoid: "Avoid",
};

export function waterQualityFor(match: { sample: AlgaeSample; distanceKm: number } | null): WaterQuality | null {
  if (!match) return null;
  const level = waterQualityLevelFor(match.sample);
  return {
    level,
    label: WATER_QUALITY_LABEL[level],
    sampledAt: match.sample.sampledAt,
    distanceKm: match.distanceKm,
    location: match.sample.location,
    microcystin: microcystinValue(match.sample.microcystin),
  };
}
