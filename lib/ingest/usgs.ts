/**
 * USGS water data ingest.
 *
 * Primary: OGC "latest-continuous" collection (GeoJSON, UTC times, value as STRING).
 *   GET https://api.waterdata.usgs.gov/ogcapi/v1/collections/latest-continuous/items
 *       ?f=json&monitoring_location_id=USGS-02322700,...&parameter_code=00060,00065,00010,63160&limit=200
 * Fallback: legacy WaterServices IV (WaterML-JSON, site-local times with offset; decommission "early 2027").
 *   GET https://waterservices.usgs.gov/nwis/iv/?format=json&sites=...&parameterCd=...&siteStatus=all
 *
 * Runtime-neutral: no Next/React/DOM imports. Every network call accepts an injectable `fetchImpl`
 * so tests run against fixtures in tests/fixtures/.
 */
import type { Park, UsgsParameter, UsgsPayload, UsgsReading } from "@/lib/types";

export const USGS_PARAMETERS: readonly UsgsParameter[] = ["00060", "00065", "00010", "63160"];

/** A reading older than this (at fetch time) is flagged `stale`. Mirrors lib/freshness STALE.usgs. */
export const USGS_STALE_MS = 6 * 3600e3;

export const USGS_OGC_URL = "https://api.waterdata.usgs.gov/ogcapi/v1/collections/latest-continuous/items";
export const USGS_LEGACY_URL = "https://waterservices.usgs.gov/nwis/iv/";

/**
 * Typical discharge baselines (ft3/s) per gauge, used ONLY for the coarse `flowFlag`.
 * These are rough long-term "normal" values from USGS period-of-record statistics and the
 * live readings observed on 2026-09-19 (research digest), rounded generously. They are NOT
 * flood stages. A discharge above HIGH_FLOW_MULTIPLIER x baseline is labelled "high" — the
 * UI shows this as an estimate with the gauge name and distance.
 *
 *   02322700  Ichetucknee R @ Hwy 27 nr Hildreth   ~250 cfs  (218 cfs observed)
 *   02322500  Santa Fe River nr Fort White        ~1200 cfs  (671 cfs observed, dry year)
 *   02321975  Santa Fe River at US 441 nr High Sp ~400 cfs   (110 cfs observed, dry year)
 *   02313098  Rainbow River nr Dunnellon          ~600 cfs   (450 cfs observed)
 *   02235500  Blue Springs nr Orange City         ~150 cfs   (174 cfs observed)
 *   02322400  Ginnie Spring                        n/a       (no discharge series; use river gauge)
 */
export const DISCHARGE_BASELINE_CFS: Readonly<Record<string, number>> = {
  "02322700": 250,
  "02322500": 1200,
  "02321975": 400,
  "02313098": 600,
  "02235500": 150,
};
export const HIGH_FLOW_MULTIPLIER = 1.5;

/** Human names for gauges, used in plain-language flow notes. */
export const GAUGE_NAMES: Readonly<Record<string, string>> = {
  "02322700": "Ichetucknee River at Hwy 27",
  "02322500": "Santa Fe River near Fort White",
  "02321975": "Santa Fe River at US 441",
  "02313098": "Rainbow River near Dunnellon",
  "02235500": "Blue Spring run",
  "02322400": "Ginnie Spring",
};

/**
 * Site-specific quirks. 02322500 (Santa Fe nr Fort White) reports gage height 00065 on an
 * arbitrary local datum (~0.07 ft) which confuses readers; we drop it and rely on 63160
 * (stream level, NAVD88) for that site.
 */
export const IGNORED_PARAMETERS_BY_SITE: Readonly<Record<string, readonly UsgsParameter[]>> = {
  "02322500": ["00065"],
};

// ---------- raw response shapes (only the fields we read) ----------

export interface OgcFeature {
  properties: {
    monitoring_location_id: string; // "USGS-02322700"
    parameter_code: string; // "00060"
    time: string; // "2026-09-19T04:45:00+00:00"
    value: string | number | null;
    unit_of_measure: string; // "ft^3/s" | "ft" | "degC"
    approval_status?: string | null; // "Provisional" | "Approved"
    qualifier?: string | null;
  };
}

export interface OgcFeatureCollection {
  type?: string;
  features: OgcFeature[];
  numberReturned?: number;
}

export interface LegacyTimeSeries {
  name?: string; // "USGS:02322500:00010:00000"
  sourceInfo: { siteCode: { value: string }[] };
  variable: {
    variableCode: { value: string }[];
    unit: { unitCode: string };
    noDataValue?: number;
  };
  values: { value: { value: string; qualifiers?: string[]; dateTime: string }[] }[];
}

export interface LegacyResponse {
  value: { timeSeries: LegacyTimeSeries[] };
}

// ---------- helpers ----------

export function normalizeSiteId(id: string): string {
  return id.replace(/^USGS-/i, "").trim();
}

export function normalizeUnit(unit: string): string {
  const u = unit.trim().toLowerCase().replace(/\s+/g, "");
  if (u === "ft^3/s" || u === "ft3/s" || u === "cfs") return "ft3/s";
  if (u === "degc" || u === "°c" || u === "c") return "degC";
  if (u === "ft") return "ft";
  return unit;
}

export function isUsgsParameter(code: string): code is UsgsParameter {
  return (USGS_PARAMETERS as readonly string[]).includes(code);
}

function toIsoUtc(time: string): string | null {
  const ms = Date.parse(time);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

export function isStaleAt(timeIso: string, now: Date, maxAgeMs = USGS_STALE_MS): boolean {
  const t = Date.parse(timeIso);
  if (Number.isNaN(t)) return true;
  return now.getTime() - t > maxAgeMs;
}

// ---------- normalizers (exported for tests) ----------

/** OGC latest-continuous GeoJSON -> readings. Skips unknown parameters and non-numeric values. */
export function normalizeOgc(json: OgcFeatureCollection, now: Date = new Date()): UsgsReading[] {
  const out: UsgsReading[] = [];
  for (const f of json?.features ?? []) {
    const p = f?.properties;
    if (!p) continue;
    const parameter = String(p.parameter_code ?? "");
    if (!isUsgsParameter(parameter)) continue;
    const value = toNumber(p.value);
    if (value === null) continue;
    const time = toIsoUtc(p.time);
    if (!time) continue;
    out.push({
      site: normalizeSiteId(String(p.monitoring_location_id ?? "")),
      parameter,
      value,
      unit: normalizeUnit(String(p.unit_of_measure ?? "")),
      time,
      stale: isStaleAt(time, now),
      provisional: String(p.approval_status ?? "").toLowerCase() !== "approved",
    });
  }
  return out;
}

/** Legacy WaterML-JSON -> readings. Handles multiple `values[]` methods per series and noDataValue. */
export function normalizeLegacy(json: LegacyResponse, now: Date = new Date()): UsgsReading[] {
  const out: UsgsReading[] = [];
  for (const ts of json?.value?.timeSeries ?? []) {
    const site = ts?.sourceInfo?.siteCode?.[0]?.value;
    const parameter = ts?.variable?.variableCode?.[0]?.value;
    if (!site || !parameter || !isUsgsParameter(parameter)) continue;
    const unit = normalizeUnit(String(ts.variable?.unit?.unitCode ?? ""));
    const noData = typeof ts.variable?.noDataValue === "number" ? ts.variable.noDataValue : -999999;
    for (const method of ts.values ?? []) {
      for (const v of method?.value ?? []) {
        const value = toNumber(v?.value);
        if (value === null || value === noData) continue;
        const time = toIsoUtc(v.dateTime);
        if (!time) continue;
        const qualifiers = v.qualifiers ?? [];
        out.push({
          site: normalizeSiteId(site),
          parameter,
          value,
          unit,
          time,
          stale: isStaleAt(time, now),
          provisional: !qualifiers.includes("A"),
        });
      }
    }
  }
  return out;
}

/** Keep only the newest reading per (site, parameter). Stable order: by site then parameter. */
export function dedupeNewest(readings: UsgsReading[]): UsgsReading[] {
  const best = new Map<string, UsgsReading>();
  for (const r of readings) {
    const key = `${r.site}:${r.parameter}`;
    const prev = best.get(key);
    if (!prev || Date.parse(r.time) > Date.parse(prev.time)) best.set(key, r);
  }
  return [...best.values()].sort((a, b) => a.site.localeCompare(b.site) || a.parameter.localeCompare(b.parameter));
}

/** Drop readings we never want to show (e.g. 00065 for 02322500 — arbitrary datum; 63160 is used instead). */
export function applySiteQuirks(readings: UsgsReading[]): UsgsReading[] {
  return readings.filter((r) => !(IGNORED_PARAMETERS_BY_SITE[r.site] ?? []).includes(r.parameter));
}

/** dedupe + quirks; idempotent. */
export function prepareReadings(readings: UsgsReading[]): UsgsReading[] {
  return applySiteQuirks(dedupeNewest(readings));
}

export function groupBySite(readings: UsgsReading[]): Record<string, UsgsReading[]> {
  const out: Record<string, UsgsReading[]> = {};
  for (const r of readings) (out[r.site] ??= []).push(r);
  return out;
}

/** Coarse flow classification for one gauge. `unknown` when there is no baseline for the site. */
export function flowFlagFor(site: string, dischargeCfs: number | null): UsgsPayload["flowFlag"] {
  const baseline = DISCHARGE_BASELINE_CFS[site];
  if (dischargeCfs === null || !Number.isFinite(dischargeCfs) || baseline === undefined) return "unknown";
  return dischargeCfs > baseline * HIGH_FLOW_MULTIPLIER ? "high" : "normal";
}

// ---------- fetching ----------

export interface FetchUsgsOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  now?: Date;
  timeoutMs?: number;
}

export interface UsgsFetchResult {
  source: UsgsPayload["source"];
  readingsBySite: Record<string, UsgsReading[]>;
  readings: UsgsReading[];
  /** error message from the OGC attempt when the legacy fallback was used */
  fallbackReason: string | null;
}

function buildOgcUrl(siteIds: string[]): string {
  const ids = siteIds.map((s) => `USGS-${normalizeSiteId(s)}`).join(",");
  const params = new URLSearchParams({
    f: "json",
    monitoring_location_id: ids,
    parameter_code: USGS_PARAMETERS.join(","),
    limit: "200",
  });
  return `${USGS_OGC_URL}?${params.toString()}`;
}

function buildLegacyUrl(siteIds: string[]): string {
  const params = new URLSearchParams({
    format: "json",
    sites: siteIds.map(normalizeSiteId).join(","),
    parameterCd: USGS_PARAMETERS.join(","),
    siteStatus: "all",
  });
  return `${USGS_LEGACY_URL}?${params.toString()}`;
}

async function getJson<T>(url: string, init: RequestInit, fetchImpl: typeof fetch, timeoutMs: number): Promise<T> {
  const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return (await res.json()) as T;
}

/**
 * One batched call for all distinct site ids. Falls back to the legacy IV service when the OGC
 * endpoint errors, times out, or returns no features. Returns readings grouped by bare site id
 * ("02322700"), newest per parameter, quirks applied, stale flags relative to `now`.
 */
export async function fetchUsgsLatestDetailed(siteIds: string[], opts: FetchUsgsOptions = {}): Promise<UsgsFetchResult> {
  const sites = [...new Set(siteIds.map(normalizeSiteId).filter(Boolean))];
  if (sites.length === 0) return { source: "usgs-ogc", readingsBySite: {}, readings: [], fallbackReason: null };
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? new Date();
  const timeoutMs = opts.timeoutMs ?? 15000;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.apiKey) headers["X-Api-Key"] = opts.apiKey;

  let fallbackReason: string | null = null;
  try {
    const json = await getJson<OgcFeatureCollection>(buildOgcUrl(sites), { headers, cache: "no-store" }, fetchImpl, timeoutMs);
    const readings = prepareReadings(normalizeOgc(json, now));
    if (readings.length > 0) {
      return { source: "usgs-ogc", readingsBySite: groupBySite(readings), readings, fallbackReason: null };
    }
    fallbackReason = "OGC latest-continuous returned no usable features";
  } catch (err) {
    fallbackReason = `OGC latest-continuous failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  const json = await getJson<LegacyResponse>(buildLegacyUrl(sites), { headers: { Accept: "application/json" }, cache: "no-store" }, fetchImpl, timeoutMs);
  const readings = prepareReadings(normalizeLegacy(json, now));
  return { source: "usgs-legacy", readingsBySite: groupBySite(readings), readings, fallbackReason };
}

/** Contract signature: readings grouped by site id. See fetchUsgsLatestDetailed for the source label. */
export async function fetchUsgsLatest(siteIds: string[], opts: FetchUsgsOptions = {}): Promise<Record<string, UsgsReading[]>> {
  const { readingsBySite } = await fetchUsgsLatestDetailed(siteIds, opts);
  return readingsBySite;
}

// ---------- payload assembly ----------

type ParkGaugeFields = Pick<Park, "usgs_site_id" | "river_gauge_site_id"> & Partial<Pick<Park, "name" | "gauge_distance_km">>;

function formatCfs(n: number): string {
  return `${Math.round(n).toLocaleString("en-US")} cfs`;
}

/**
 * Merge the park's own gauge and its river gauge into one payload. The flow flag uses the
 * freshest non-stale discharge, preferring the park's own gauge; the river gauge (often the only
 * one with discharge, e.g. Ginnie/Poe/Gilchrist Blue) is used otherwise and named in flowNote.
 */
export function buildUsgsPayloadForPark(
  park: ParkGaugeFields,
  readingsBySite: Record<string, UsgsReading[]>,
  fetchedAt: string | Date,
  source: UsgsPayload["source"] = "usgs-ogc",
): UsgsPayload {
  const own = park.usgs_site_id ? normalizeSiteId(park.usgs_site_id) : null;
  const river = park.river_gauge_site_id ? normalizeSiteId(park.river_gauge_site_id) : null;
  const sites = [...new Set([own, river].filter((s): s is string => !!s))];
  const merged = prepareReadings(sites.flatMap((s) => readingsBySite[s] ?? []));
  const fetchedAtIso = typeof fetchedAt === "string" ? fetchedAt : fetchedAt.toISOString();

  let flowFlag: UsgsPayload["flowFlag"] = "unknown";
  let flowNote: string | null = null;

  const dischargeFor = (site: string | null) =>
    site ? merged.find((r) => r.site === site && r.parameter === "00060" && !r.stale) ?? null : null;
  const pick = dischargeFor(own) ?? dischargeFor(river);

  if (pick) {
    flowFlag = flowFlagFor(pick.site, pick.value);
    const gauge = GAUGE_NAMES[pick.site] ?? `gauge ${pick.site}`;
    const baseline = DISCHARGE_BASELINE_CFS[pick.site];
    const isRiver = pick.site !== own;
    const where = isRiver
      ? `${gauge}${park.gauge_distance_km ? ` (${park.gauge_distance_km.toFixed(1)} km away)` : ""}`
      : gauge;
    if (flowFlag === "high") {
      flowNote = `${where} is flowing at ${formatCfs(pick.value)}, well above the typical ${formatCfs(baseline)}. Expect strong current and murkier water.`;
    } else if (flowFlag === "normal") {
      flowNote = `${where} is flowing at ${formatCfs(pick.value)}, within the typical range (about ${formatCfs(baseline)}).`;
    } else {
      flowNote = `${where} is flowing at ${formatCfs(pick.value)}. No typical baseline is known for this gauge.`;
    }
  } else if (merged.some((r) => r.parameter === "00060")) {
    flowNote = "The latest flow reading is more than 6 hours old, so we are not rating the current.";
  } else if (sites.length > 0) {
    flowNote = "No live flow reading is available for this park.";
  } else {
    flowNote = "This park has no USGS gauge.";
  }

  return { source, fetchedAt: fetchedAtIso, readings: merged, flowFlag, flowNote };
}
