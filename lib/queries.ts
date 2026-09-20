/**
 * Read-side data assembly for Server Components (publishable key, no cookies => cacheable).
 *
 * Loads rows in as few queries as possible, then runs the pure LOGIC functions
 * (getDayContext -> predictClosure -> summarizeReports -> getParkStatus -> suggestBackups)
 * to build ParkWithStatus / ParkBundle. Never throws on network or schema failure:
 * getParksWithStatus() -> [], getParkBundle() -> null, getParkSlugs() -> [], getParkById() -> null.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createPublicClient } from "@/lib/supabase/server";
import { getDayContext } from "@/lib/holidays";
import { predictClosure } from "@/lib/prediction";
import { summarizeReports } from "@/lib/reportStatus";
import { getParkStatus } from "@/lib/parkStatus";
import { suggestBackups } from "@/lib/backups";
import {
  DEFAULT_FILTERS,
  type Accessibility,
  type CalendarEvent,
  type DayContext,
  type Holiday,
  type LongWeekend,
  type NoaaPayload,
  type Park,
  type ParkAlert,
  type ParkBundle,
  type ParkWithStatus,
  type ParkingLot,
  type Report,
  type ReportConfirmation,
  type UsgsPayload,
  type WeatherPayload,
} from "@/lib/types";
import eventsJson from "@/data/events.json";

/** Reports/confirmations loaded for the status summary (LOGIC applies the same 2 h window). */
export const REPORT_WINDOW_MS = 2 * 3600e3;
/** Reports shown on the detail page (older ones still render with their timestamp). */
export const BUNDLE_REPORTS_WINDOW_MS = 24 * 3600e3;
export const BUNDLE_REPORTS_LIMIT = 50;

type Db = SupabaseClient<Database>;

interface LatestRow {
  park_id: string | null;
  source: string | null;
  payload: unknown;
  fetched_at: string | null;
}

interface World {
  parks: Park[];
  accessibility: Map<string, Accessibility>;
  latest: LatestRow[];
  alerts: ParkAlert[];
  reports: Report[];
  confirmations: ReportConfirmation[];
  holidays: Holiday[];
  longWeekends: LongWeekend[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar events bundled at build time from data/events.json ({ events: CalendarEvent[] }). */
export function loadEvents(): CalendarEvent[] {
  const raw = (eventsJson as { events?: unknown }).events;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is CalendarEvent =>
      !!e && typeof e === "object" && DATE_RE.test(String((e as CalendarEvent).start)) && DATE_RE.test(String((e as CalendarEvent).end)) && typeof (e as CalendarEvent).name === "string",
  );
}

function warn(scope: string, err: unknown): void {
  const message = err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : String(err);
  console.warn(`[lakelens/queries] ${scope}: ${message}`);
}

/** Tolerate a failed non-critical query (e.g. table not migrated yet): log and use []. */
function rowsOr<T>(scope: string, res: { data: unknown; error: { message: string } | null }): T[] {
  if (res.error) {
    warn(scope, res.error);
    return [];
  }
  return (res.data ?? []) as T[];
}

async function loadWorld(db: Db, now: Date): Promise<World> {
  const since = new Date(now.getTime() - REPORT_WINDOW_MS).toISOString();
  const [parksR, accR, latestR, alertsR, reportsR, confR, holR, lwR] = await Promise.all([
    db.from("parks").select("*").order("name"),
    db.from("accessibility").select("*"),
    db.from("latest_conditions").select("park_id,source,payload,fetched_at"),
    db.from("park_alerts").select("*").eq("active", true),
    db.from("reports").select("*").gte("created_at", since).order("created_at", { ascending: false }),
    db.from("report_confirmations").select("*").gte("created_at", since),
    db.from("holidays").select("*"),
    db.from("long_weekends").select("*"),
  ]);
  if (parksR.error) throw new Error(`parks: ${parksR.error.message}`);

  const accessibility = new Map<string, Accessibility>();
  for (const a of rowsOr<Accessibility>("accessibility", accR)) accessibility.set(a.park_id, a);

  return {
    parks: (parksR.data ?? []) as unknown as Park[],
    accessibility,
    latest: rowsOr<LatestRow>("latest_conditions", latestR),
    alerts: rowsOr<ParkAlert>("park_alerts", alertsR),
    reports: rowsOr<Report>("reports", reportsR),
    confirmations: rowsOr<ReportConfirmation>("report_confirmations", confR),
    holidays: rowsOr<Holiday>("holidays", holR),
    longWeekends: rowsOr<LongWeekend>("long_weekends", lwR),
  };
}

function newest(rows: LatestRow[]): LatestRow | null {
  let best: LatestRow | null = null;
  for (const r of rows) {
    if (!best || (r.fetched_at ?? "") > (best.fetched_at ?? "")) best = r;
  }
  return best;
}

function assemble(park: Park, world: World, dayContext: DayContext, now: Date): ParkWithStatus {
  const mine = world.latest.filter((r) => r.park_id === park.id);
  const usgsRow = newest(mine.filter((r) => r.source === "usgs"));
  // Coastal parks have no USGS gauge; their water data is a NOAA CO-OPS snapshot instead.
  const noaaRow = newest(mine.filter((r) => r.source === "noaa"));
  const weatherRow = newest(mine.filter((r) => r.source === "nws"));
  const usgs = (usgsRow?.payload as UsgsPayload | undefined) ?? null;
  const noaa = (noaaRow?.payload as NoaaPayload | undefined) ?? null;
  const weather = (weatherRow?.payload as WeatherPayload | undefined) ?? null;

  const alerts = world.alerts.filter((a) => a.park_id === park.id);
  const reports = world.reports.filter((r) => r.park_id === park.id);
  const reportIds = new Set(reports.map((r) => r.id));
  const confirmations = world.confirmations.filter((c) => reportIds.has(c.report_id));

  const reportSummary = summarizeReports(reports, confirmations, now);
  const prediction = predictClosure({ park, dayContext, weather, alerts }, now);
  const status = getParkStatus({ park, alerts, reportSummary, prediction, now });

  return {
    park,
    status,
    prediction,
    accessibility: world.accessibility.get(park.id) ?? null,
    usgs,
    usgsFetchedAt: usgsRow?.fetched_at ?? usgs?.fetchedAt ?? null,
    noaa,
    noaaFetchedAt: noaaRow?.fetched_at ?? noaa?.fetchedAt ?? null,
    weather,
    weatherFetchedAt: weatherRow?.fetched_at ?? weather?.fetchedAt ?? null,
    alerts,
    reportSummary,
    distanceKm: null,
  };
}

/**
 * Parameters any list/map surface actually renders (conditionStatItems + describeFlow).
 * Everything else in a USGS payload is dead weight in the RSC payload.
 */
const LIST_USGS_PARAMETERS = new Set(["00010", "00060", "00065", "63160"]);

/**
 * Shrink a ParkWithStatus to what the map and list screens draw.
 *
 * The map page serialises all 84 parks twice (HTML + RSC payload), and a deep park's
 * NWS snapshot carries a 156-entry hourly grid plus a 14-day outlook that no list or
 * map surface ever reads. Dropping those — and the gauge parameters we don't chart —
 * is invisible on screen and removes most of the document weight. Prediction has
 * already run against the full payload by the time this is applied.
 */
function slimForList(item: ParkWithStatus): ParkWithStatus {
  const weather = item.weather ? { ...item.weather, hourly: [], daily: [] } : null;
  const usgs = item.usgs ? { ...item.usgs, readings: item.usgs.readings.filter((r) => LIST_USGS_PARAMETERS.has(r.parameter)) } : null;
  return { ...item, weather, usgs };
}

function assembleAll(world: World, now: Date): ParkWithStatus[] {
  const dayContext = getDayContext(now, world.holidays, world.longWeekends, loadEvents());
  return world.parks.map((park) => assemble(park, world, dayContext, now));
}

/** Every park with derived status — the map and list screens. */
export async function getParksWithStatus(now: Date = new Date()): Promise<ParkWithStatus[]> {
  try {
    const db = createPublicClient();
    const world = await loadWorld(db, now);
    return assembleAll(world, now).map(slimForList);
  } catch (err) {
    warn("getParksWithStatus", err);
    return [];
  }
}

/** One park with parking lots, recent reports, confirmations and backup suggestions — the detail page. */
export async function getParkBundle(slug: string, now: Date = new Date()): Promise<ParkBundle | null> {
  try {
    const db = createPublicClient();
    const world = await loadWorld(db, now);
    const all = assembleAll(world, now);
    const target = all.find((p) => p.park.slug === slug);
    if (!target) return null;

    const since = new Date(now.getTime() - BUNDLE_REPORTS_WINDOW_MS).toISOString();
    const [lotsR, reportsR] = await Promise.all([
      // Every park's lots, not just this one: suggestBackups summarises parking for the
      // backup candidates too.
      db.from("parking_lots").select("*").order("is_overflow").order("name"),
      db
        .from("reports")
        .select("*")
        .eq("park_id", target.park.id)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(BUNDLE_REPORTS_LIMIT),
    ]);
    const lots = rowsOr<ParkingLot>("parking_lots", lotsR);
    const reports = rowsOr<Report>("reports(24h)", reportsR);

    let confirmations: ReportConfirmation[] = [];
    if (reports.length > 0) {
      const confR = await db
        .from("report_confirmations")
        .select("*")
        .in(
          "report_id",
          reports.map((r) => r.id),
        );
      confirmations = rowsOr<ReportConfirmation>("report_confirmations(24h)", confR);
    }

    const lotsByPark: Record<string, ParkingLot[]> = {};
    for (const lot of lots) (lotsByPark[lot.park_id] ??= []).push(lot);

    const backups = suggestBackups(target, all, DEFAULT_FILTERS, lotsByPark);
    return {
      ...target,
      parkingLots: lotsByPark[target.park.id] ?? [],
      reports,
      confirmations,
      backups,
    };
  } catch (err) {
    warn(`getParkBundle(${slug})`, err);
    return null;
  }
}

/** Slugs for generateStaticParams / sitemaps. */
export async function getParkSlugs(): Promise<string[]> {
  try {
    const db = createPublicClient();
    const { data, error } = await db.from("parks").select("slug").order("slug");
    if (error) throw error;
    return (data ?? []).map((r) => r.slug);
  } catch (err) {
    warn("getParkSlugs", err);
    return [];
  }
}

export async function getParkById(id: string): Promise<Park | null> {
  try {
    const db = createPublicClient();
    const { data, error } = await db.from("parks").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return (data as unknown as Park | null) ?? null;
  } catch (err) {
    warn(`getParkById(${id})`, err);
    return null;
  }
}
