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
import { DEFAULT_TZ } from "@/lib/freshness";
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
  type ParkForecast,
  type Review,
  type ReviewStats,
  type ParkAlert,
  type ParkBundle,
  type ParkWithStatus,
  type ParkingLot,
  type Report,
  type ReportConfirmation,
  type UsgsPayload,
  type WeatherPayload,
} from "@/lib/types";

/** Reports/confirmations loaded for the status summary (LOGIC applies the same 2 h window). */
export const REPORT_WINDOW_MS = 2 * 3600e3;
/** Reports shown on the detail page (older ones still render with their timestamp). */
export const BUNDLE_REPORTS_WINDOW_MS = 24 * 3600e3;
export const BUNDLE_REPORTS_LIMIT = 50;
/** Reviews shown on the detail page, newest first. */
export const REVIEWS_LIMIT = 30;

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
  events: CalendarEvent[];
  forecasts: Map<string, ParkForecast>;
  reviewStats: Map<string, ReviewStats>;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface CalendarEventRow {
  name: string | null;
  start_date: string | null;
  end_date: string | null;
  weight: number | null;
}

/**
 * Crowd-driving calendar events (UF home games, spring break, summer) from the database.
 *
 * These used to be imported from data/events.json and bundled at build time, which meant
 * adding next season's home games was a code change and a redeploy. They live in
 * public.calendar_events now; data/events.json is only the seed source.
 */
export function toCalendarEvents(rows: CalendarEventRow[]): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const r of rows) {
    if (!r?.name || !r.start_date || !r.end_date) continue;
    if (!DATE_RE.test(r.start_date) || !DATE_RE.test(r.end_date)) continue;
    out.push({ start: r.start_date, end: r.end_date, name: r.name, weight: r.weight ?? 1 });
  }
  return out;
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

interface ParkForecastRow {
  park_id: string;
  forecast_at: string | null;
  now_temp_f: number | null;
  now_feels_like_f: number | null;
  now_uv: number | null;
  now_humidity: number | null;
  now_wind_mph: number | null;
  now_thunder_prob: number | null;
  now_short_forecast: string | null;
  uv_peak: number | null;
  uv_peak_hour: number | null;
  hourly: unknown;
  daily: unknown;
  water_quality: unknown;
  sources: unknown;
}

/** park_forecast rows keyed by park id. */
function toForecasts(rows: ParkForecastRow[]): Map<string, ParkForecast> {
  const out = new Map<string, ParkForecast>();
  for (const r of rows) {
    if (!r?.park_id) continue;
    out.set(r.park_id, {
      forecastAt: r.forecast_at ?? "",
      nowTempF: r.now_temp_f,
      nowFeelsLikeF: r.now_feels_like_f,
      nowUv: r.now_uv,
      nowHumidity: r.now_humidity,
      nowWindMph: r.now_wind_mph,
      nowThunderProb: r.now_thunder_prob,
      nowShortForecast: r.now_short_forecast,
      uvPeak: r.uv_peak,
      uvPeakHour: r.uv_peak_hour,
      hourly: (r.hourly as ParkForecast["hourly"]) ?? null,
      daily: Array.isArray(r.daily) ? (r.daily as ParkForecast["daily"]) : [],
      waterQuality: (r.water_quality as ParkForecast["waterQuality"]) ?? null,
      sources: (r.sources as ParkForecast["sources"]) ?? {},
    });
  }
  return out;
}

interface ReviewStatsRow {
  park_id: string;
  review_count: number | null;
  average_rating: number | string | null;
  sample_count: number | null;
  count_1: number | null;
  count_2: number | null;
  count_3: number | null;
  count_4: number | null;
  count_5: number | null;
}

/**
 * park_review_stats rows keyed by park id.
 *
 * Postgres returns `numeric` as a string over PostgREST, so the average is parsed rather
 * than trusted to arrive as a number.
 */
function toReviewStats(rows: ReviewStatsRow[]): Map<string, ReviewStats> {
  const out = new Map<string, ReviewStats>();
  for (const r of rows) {
    if (!r?.park_id) continue;
    const avg = r.average_rating == null ? null : Number(r.average_rating);
    out.set(r.park_id, {
      reviewCount: r.review_count ?? 0,
      averageRating: avg != null && Number.isFinite(avg) ? avg : null,
      sampleCount: r.sample_count ?? 0,
      distribution: [r.count_1 ?? 0, r.count_2 ?? 0, r.count_3 ?? 0, r.count_4 ?? 0, r.count_5 ?? 0],
    });
  }
  return out;
}

/**
 * PostgREST answers with at most 1,000 rows and says nothing about the rest.
 *
 * That was invisible while there were 616 parks. At 2,043 the map showed exactly 1,000 of
 * them, and every per-park table behind it was cut at the same point: a park past the
 * boundary would have rendered with no conditions and no forecast rather than not at all,
 * which is worse than missing.
 *
 * Paging stops on a short page, so a table under the limit still costs one request.
 */
export const PAGE_SIZE = 1000;

/**
 * Columns the world load actually reads.
 *
 * The anon role has a three second statement timeout, and `select("*")` across eleven
 * tables at 2,100 parks went past it: the list rendered "0 parks shown" and the build wrote
 * park pages with no weather. Naming columns is what brings it back under budget.
 *
 * `hourly` is the expensive one. It is a day of parallel arrays per park, it is the reason
 * park_forecast is four megabytes, and no list, map or status calculation touches it. The
 * one page that draws it fetches it for its own park.
 */
const FORECAST_LIST_COLUMNS =
  "park_id,forecast_at,now_temp_f,now_feels_like_f,now_uv,now_humidity,now_wind_mph,now_thunder_prob,now_short_forecast,uv_peak,uv_peak_hour,daily,water_quality,sources";

export async function selectAll<T>(
  scope: string,
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  { required = false }: { required?: boolean } = {},
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) {
      // Same bargain rowsOr struck: without parks there is no page, and without reviews
      // there is a page with no stars. Only the first is worth failing over. A later page
      // failing keeps the earlier ones, which is a partial list rather than none.
      if (required) throw new Error(`${scope}: ${error.message}`);
      warn(scope, error);
      return out;
    }
    const page = (data ?? []) as T[];
    out.push(...page);
    if (page.length < PAGE_SIZE) return out;
  }
}

async function loadWorld(db: Db, now: Date): Promise<World> {
  const since = new Date(now.getTime() - REPORT_WINDOW_MS).toISOString();
  // Every table keyed by park can now pass a thousand rows. The calendar ones cannot, and
  // are paged anyway rather than leaving a trap for whoever adds the next decade.
  const [parks, accRows, latestRows, alertRows, reportRows, confRows, holRows, lwRows, evRows, fcRows, rsRows] =
    await Promise.all([
      selectAll<Park>("parks", (a, b) => db.from("parks").select("*").order("name").range(a, b), { required: true }),
      selectAll<Accessibility>("accessibility", (a, b) => db.from("accessibility").select("*").range(a, b)),
      selectAll<LatestRow>("latest_conditions", (a, b) =>
        db.from("latest_conditions").select("park_id,source,payload,fetched_at").range(a, b),
      ),
      selectAll<ParkAlert>("park_alerts", (a, b) => db.from("park_alerts").select("*").eq("active", true).range(a, b)),
      selectAll<Report>("reports", (a, b) =>
        db.from("reports").select("*").gte("created_at", since).order("created_at", { ascending: false }).range(a, b),
      ),
      selectAll<ReportConfirmation>("report_confirmations", (a, b) =>
        db.from("report_confirmations").select("*").gte("created_at", since).range(a, b),
      ),
      selectAll<Holiday>("holidays", (a, b) => db.from("holidays").select("*").range(a, b)),
      selectAll<LongWeekend>("long_weekends", (a, b) => db.from("long_weekends").select("*").range(a, b)),
      selectAll<CalendarEventRow>("calendar_events", (a, b) =>
        db.from("calendar_events").select("name,start_date,end_date,weight").range(a, b),
      ),
      selectAll<ParkForecastRow>("park_forecast", (a, b) =>
        db.from("park_forecast").select(FORECAST_LIST_COLUMNS).range(a, b),
      ),
      selectAll<ReviewStatsRow>("park_review_stats", (a, b) => db.from("park_review_stats").select("*").range(a, b)),
    ]);

  const accessibility = new Map<string, Accessibility>();
  for (const a of accRows) accessibility.set(a.park_id, a);

  return {
    parks,
    accessibility,
    latest: latestRows,
    alerts: alertRows,
    reports: reportRows,
    confirmations: confRows,
    holidays: holRows,
    longWeekends: lwRows,
    events: toCalendarEvents(evRows),
    forecasts: toForecasts(fcRows),
    reviewStats: toReviewStats(rsRows),
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
  const prediction = predictClosure({ park, dayContext, weather, alerts }, now, park.time_zone || undefined);
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
    forecast: world.forecasts.get(park.id) ?? null,
    reviewStats: world.reviewStats.get(park.id) ?? null,
    alerts,
    reportSummary,
    distanceKm: null,
  };
}

/**
 * Parameters a list or map card actually renders. Discharge (00060) left when flow stopped
 * being a headline stat; it is still ingested for the high-flow safety warning.
 */
const LIST_USGS_PARAMETERS = new Set(["00010", "00065", "63160"]);

/**
 * Shrink a ParkWithStatus to what the map and list screens draw.
 *
 * The map page serialises every park twice (HTML + RSC payload), and a deep park's
 * NWS snapshot carries a 156-entry hourly grid plus a 14-day outlook that no list or
 * map surface ever reads. Dropping those, and the gauge parameters we don't chart,
 * is invisible on screen and removes most of the document weight. Prediction has
 * already run against the full payload by the time this is applied.
 */
/**
 * Fields of `park` the list and the map actually read.
 *
 * Everything else on the row is prose and plumbing: descriptions, safety notes, entrance
 * notes, rules, gauge ids, NWS grid coordinates, licence strings. None of it reaches a
 * card, and all of it was being serialised twice for every park. At 2,100 parks the page
 * went to 5 MB raw and 399 kB gzipped, from 156 kB at 616.
 *
 * Derived from what the components dereference, so adding a field to a card means adding
 * it here. The park page does not use this path: it loads the whole row for its one park.
 */
const LIST_PARK_FIELDS = [
  "id",
  "slug",
  "name",
  "type",
  "operator",
  "lat",
  "lng",
  "state",
  "city",
  "coverage_tier",
  "guarded",
  "photo_url",
  // Short, and the strongest signal lib/related.ts has: two beaches on one lake are
  // genuinely interchangeable in a way two beaches in one state are not.
  "water_body",
  "swim_season",
  "time_zone",
  "typical_closure_time",
] as const satisfies readonly (keyof Park)[];

function slimPark(park: Park): Park {
  const out: Partial<Park> = {};
  for (const key of LIST_PARK_FIELDS) {
    (out as Record<string, unknown>)[key] = park[key];
  }
  return out as Park;
}

function slimForList(item: ParkWithStatus): ParkWithStatus {
  const weather = item.weather ? { ...item.weather, hourly: [], daily: [] } : null;
  const usgs = item.usgs ? { ...item.usgs, readings: item.usgs.readings.filter((r) => LIST_USGS_PARAMETERS.has(r.parameter)) } : null;
  // A card draws at most three stats, so everything else in the forecast row is dead
  // weight in a document that serialises every park twice. Only the fields
  // conditionStatItems actually reads survive the trip to the list and the map.
  const f = item.forecast;
  const forecast: ParkForecast | null = f
    ? {
        forecastAt: "",
        nowTempF: f.nowTempF,
        nowFeelsLikeF: f.nowFeelsLikeF,
        nowUv: f.nowUv,
        nowHumidity: null,
        nowWindMph: null,
        nowThunderProb: null,
        nowShortForecast: null,
        uvPeak: f.uvPeak,
        uvPeakHour: null,
        hourly: null,
        daily: [],
        waterQuality: f.waterQuality,
        sources: {},
      }
    : null;
  // A card draws one star, the mean and the count. The 1-5 histogram is only ever shown
  // on the park page, so it does not need to cross to the list or the map.
  const reviewStats = item.reviewStats
    ? { ...item.reviewStats, distribution: [0, 0, 0, 0, 0] as ReviewStats["distribution"] }
    : item.reviewStats;
  return {
    ...item,
    park: slimPark(item.park),
    weather,
    usgs,
    forecast,
    reviewStats,
    // The prediction object is only ever drawn on the park page, and at 616 parks its
    // reasons array alone is a meaningful share of the document. The status it produced
    // survives; the working out does not need to.
    prediction: null,
    // Only the first reason reaches a card (the map preview), so the rest are dropped.
    status: item.status.reasons.length > 1 ? { ...item.status, reasons: item.status.reasons.slice(0, 1) } : item.status,
    // Alerts are rendered on the park page only.
    alerts: [],
  };
}

function assembleAll(world: World, now: Date): ParkWithStatus[] {
  // Two parks in the same zone share a day context, so build one per zone rather than
  // one per park: nationwide that is a handful of contexts instead of eighty.
  const byZone = new Map<string, DayContext>();
  const contextFor = (tz: string): DayContext => {
    let ctx = byZone.get(tz);
    if (!ctx) {
      ctx = getDayContext(now, world.holidays, world.longWeekends, world.events, tz);
      byZone.set(tz, ctx);
    }
    return ctx;
  };
  return world.parks.map((park) => assemble(park, world, contextFor(park.time_zone || DEFAULT_TZ), now));
}

/** Every park with derived status: the map and list screens. */
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

/** One park with parking lots, recent reports, confirmations and backup suggestions: the detail page. */
export async function getParkBundle(slug: string, now: Date = new Date()): Promise<ParkBundle | null> {
  try {
    const db = createPublicClient();
    const world = await loadWorld(db, now);
    const all = assembleAll(world, now);
    const target = all.find((p) => p.park.slug === slug);
    if (!target) return null;

    const since = new Date(now.getTime() - BUNDLE_REPORTS_WINDOW_MS).toISOString();
    // The world load leaves `hourly` behind because it is a day of arrays per park and only
    // this page draws it. One row, one column, for the park being rendered.
    const hourlyR = await db.from("park_forecast").select("hourly").eq("park_id", target.park.id).maybeSingle();
    if (hourlyR.error) warn("park_forecast(hourly)", hourlyR.error);
    const hourly = (hourlyR.data?.hourly ?? null) as ParkForecast["hourly"];
    const withHourly: ParkWithStatus =
      target.forecast && hourly ? { ...target, forecast: { ...target.forecast, hourly } } : target;

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

    const reviewsR = await db
      .from("reviews")
      .select("*")
      .eq("park_id", target.park.id)
      .order("created_at", { ascending: false })
      .limit(REVIEWS_LIMIT);

    const backups = suggestBackups(target, all, DEFAULT_FILTERS, lotsByPark);
    return {
      ...withHourly,
      reviews: rowsOr<Review>("reviews", reviewsR),
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

/**
 * Every park slug, for the sitemap.
 *
 * Paged, because there are more than a thousand of them and a sitemap missing two thirds
 * of the site is worse than no sitemap.
 */
export async function getParkSlugs(): Promise<string[]> {
  try {
    const db = createPublicClient();
    const rows = await selectAll<{ slug: string }>("getParkSlugs", (a, b) =>
      db.from("parks").select("slug").order("slug").range(a, b),
    );
    return rows.map((r) => r.slug);
  } catch (err) {
    warn("getParkSlugs", err);
    return [];
  }
}

/**
 * Slugs worth building before anyone asks for them.
 *
 * Prerendering all of them stopped working at 2,100 parks: the build generated 1,013 pages,
 * each one loading the whole world, and Postgres started cancelling statements. Pages were
 * being written out with no conditions at all, which looks like a park with no weather
 * rather than a build failure, so it would have shipped.
 *
 * The curated parks are built ahead. Everything else renders on first request and is cached
 * by the same `revalidate` the prebuilt ones use, so a visitor sees no difference and the
 * build stays flat as the harvest grows.
 */
export async function getPrerenderParkSlugs(): Promise<string[]> {
  try {
    const db = createPublicClient();
    const { data, error } = await db
      .from("parks")
      .select("slug")
      .in("coverage_tier", ["deep", "extra"])
      .order("slug");
    if (error) throw error;
    return (data ?? []).map((r) => r.slug);
  } catch (err) {
    warn("getPrerenderParkSlugs", err);
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
