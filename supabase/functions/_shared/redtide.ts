/**
 * Red tide (Karenia brevis) from the FWC harmful-algal-bloom layer.
 *
 * FWC publishes its current HAB sampling as a public ArcGIS FeatureServer. This is the
 * coastal counterpart to the FDEP algal-bloom feed: FDEP covers inland cyanobacteria,
 * FWC covers marine red tide. 44 of the 84 parks are beaches, so this is the water-quality
 * signal for more than half the app.
 *
 * Red tide is a marine phenomenon, so an inland spring or river gets no reading at all
 * rather than a reassuring "Not present" borrowed from a sample 80 km away on the coast.
 */
import { haversineKm } from "./gauges.ts";

export const FWC_HAB_QUERY_URL =
  "https://services2.arcgis.com/z6TmTIyYXEYhuNM0/arcgis/rest/services/HAB_Current_Web_Layer/FeatureServer/0/query";
export const FWC_HAB_DASHBOARD_URL = "https://myfwc.com/research/redtide/statewide/";

/**
 * How far a sample can be and still describe this beach.
 *
 * FWC's own statewide view reasons in whole counties, but a park page is a swim decision,
 * so this is tighter and the reading always prints the distance to the sample it used.
 */
export const RED_TIDE_MATCH_KM = 40;
/** Samples older than this are dropped: a bloom three weeks ago says nothing about today. */
export const RED_TIDE_WINDOW_DAYS = 14;

/** FWC's abundance bands, lowest to highest. */
export type RedTideLevel = "none" | "very-low" | "low" | "medium" | "high";

export interface HabSample {
  id: string;
  sampledAt: string;
  lat: number;
  lng: number;
  county: string | null;
  location: string | null;
  abundance: string;
  level: RedTideLevel;
}

export interface RedTide {
  level: RedTideLevel;
  label: string;
  /** FWC's own abundance wording, kept verbatim for the detail line. */
  abundance: string;
  sampledAt: string;
  distanceKm: number;
  location: string | null;
  sampleCount: number;
}

const OUT_FIELDS = ["OBJECTID", "Abundance", "County", "LATITUDE", "LONGITUDE", "LOCATION", "SAMPLE_DATE", "SampleDate_t"];

export function buildHabQueryUrl(): string {
  const params = new URLSearchParams({
    f: "json",
    where: "1=1",
    outFields: OUT_FIELDS.join(","),
    returnGeometry: "false",
    resultRecordCount: "2000",
  });
  return `${FWC_HAB_QUERY_URL}?${params.toString()}`;
}

/**
 * FWC writes abundance as prose with the cell count in brackets, e.g.
 * "not present/background (0-1,000)" or "medium (100,000-1,000,000)".
 *
 * Order matters: "very low" contains "low", and "not present/background" contains neither,
 * so the specific cases are tested before the general ones.
 */
export function abundanceLevel(abundance: string): RedTideLevel {
  const a = (abundance ?? "").toLowerCase();
  if (a.includes("high")) return "high";
  if (a.includes("medium")) return "medium";
  if (a.includes("very low")) return "very-low";
  if (a.includes("low")) return "low";
  return "none";
}

const RANK: Record<RedTideLevel, number> = { none: 0, "very-low": 1, low: 2, medium: 3, high: 4 };

export const RED_TIDE_LABEL: Record<RedTideLevel, string> = {
  none: "Not present",
  "very-low": "Very low",
  low: "Low",
  medium: "Medium",
  high: "High",
};

interface HabFeature {
  attributes?: Record<string, unknown>;
}

function str(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

/** ArcGIS features to samples. Rows without coordinates or a date are dropped. */
export function normalizeHab(json: { features?: HabFeature[]; error?: unknown }): HabSample[] {
  const out: HabSample[] = [];
  for (const f of json?.features ?? []) {
    const a = f?.attributes ?? {};
    const lat = Number(a.LATITUDE);
    const lng = Number(a.LONGITUDE);
    const ms = typeof a.SAMPLE_DATE === "number" ? a.SAMPLE_DATE : Date.parse(String(a.SampleDate_t ?? ""));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(ms)) continue;
    const abundance = str(a.Abundance) ?? "";
    out.push({
      id: String(a.OBJECTID ?? `${lat},${lng},${ms}`),
      sampledAt: new Date(ms).toISOString(),
      lat,
      lng,
      county: str(a.County),
      location: str(a.LOCATION),
      abundance,
      level: abundanceLevel(abundance),
    });
  }
  return out;
}

/**
 * The reading for one beach: the WORST recent level in range, reported with the distance
 * to that sample.
 *
 * Worst rather than nearest, deliberately. A bloom is patchy and drifts, so a clean sample
 * at the pier does not mean the water is clean a kilometre down the beach, and the cost of
 * under-reporting is someone swimming in it.
 */
export function redTideForPark(
  samples: HabSample[],
  park: { lat: number; lng: number; type?: string | null },
  now: Date = new Date(),
  maxKm = RED_TIDE_MATCH_KM,
): RedTide | null {
  // Inland water never has red tide; saying "Not present" there would imply we checked.
  if (park.type !== "beach") return null;

  const cutoff = now.getTime() - RED_TIDE_WINDOW_DAYS * 24 * 3600e3;
  let worst: { sample: HabSample; km: number } | null = null;
  let count = 0;

  for (const s of samples) {
    const t = Date.parse(s.sampledAt);
    if (!Number.isFinite(t) || t < cutoff) continue;
    const km = haversineKm(park.lat, park.lng, s.lat, s.lng);
    if (km > maxKm) continue;
    count += 1;
    if (!worst || RANK[s.level] > RANK[worst.sample.level] || (RANK[s.level] === RANK[worst.sample.level] && km < worst.km)) {
      worst = { sample: s, km };
    }
  }
  if (!worst) return null;

  return {
    level: worst.sample.level,
    label: RED_TIDE_LABEL[worst.sample.level],
    abundance: worst.sample.abundance,
    sampledAt: worst.sample.sampledAt,
    distanceKm: Math.round(worst.km * 10) / 10,
    location: worst.sample.location,
    sampleCount: count,
  };
}

export interface FetchHabOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export async function fetchHabSamples(opts: FetchHabOptions = {}): Promise<HabSample[]> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(buildHabQueryUrl(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
  });
  if (!res.ok) throw new Error(`FWC HAB HTTP ${res.status}`);
  const json = (await res.json()) as { features?: HabFeature[]; error?: { message?: string } };
  if (json?.error) throw new Error(`FWC HAB: ${json.error.message ?? "query error"}`);
  return normalizeHab(json);
}
