/**
 * LakeLens `refresh-conditions` Edge Function: the single scheduled ingestion path.
 *
 * pg_cron (supabase/migrations/*_edge_cron.sql) POSTs here on a schedule; the app's
 * /api/refresh proxies here for on-demand refresh when a park page finds stale data.
 * Everything runs inside Supabase, so there is no dependency on the Vercel deployment.
 *
 *   weather   National Weather Service for EVERY park (no second provider by design)
 *   noaa      NOAA CO-OPS water temperature + tide for coastal parks
 *   usgs      USGS gauges (batched 40 sites per request) for springs and rivers
 *   alerts    one NWS FL alert sweep, matched to parks by UGC zone/county
 *   algae     FDEP algal-bloom samples -> park_alerts notices
 *   holidays  Nager.Date public holidays + long weekends
 *   prune     drop conditions_snapshots older than 7 days
 *   parking   OpenStreetMap (Overpass) parking lots for every park: weekly
 *   stations  backfill missing USGS gauge / NOAA station / NWS grid assignments: weekly
 *   forecast  park_forecast: NWS weather + gridpoint extras + EPA UV, one row per park: hourly
 *
 * The fetch/normalise logic lives in ../_shared/*, which the Next.js app and vitest
 * import too, so there is exactly one implementation of each parser.
 */
import { withSupabase, type SupabaseContext } from "npm:@supabase/server@^1";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildUsgsPayloadForPark, fetchUsgsLatestDetailed } from "../_shared/usgs.ts";
import { buildNoaaPayloadForPark, fetchNoaaLatest } from "../_shared/noaa.ts";
import { fetchAlertsFL, fetchNwsWeather, matchAlertsToPark, type NwsAlertFeature } from "../_shared/nws.ts";
import { fetchLongWeekends, fetchNagerHolidays } from "../_shared/holidays.ts";
import { fetchParkingElements, groupParkingByPark } from "../_shared/overpass.ts";
import { assembleForecast, type ForecastPark } from "../_shared/forecast.ts";
import { WATER_QUALITY_MATCH_KM, nearestSample, waterQualityFor } from "../_shared/algae.ts";
import { assignGauges, assignNwsGrid, fetchNoaaStationCandidates, nearestStation } from "../_shared/stations.ts";
import { nwsAlertHash } from "../_shared/hash.ts";
import type { CronJob, NwsGrid, ParkAlertInsert, ParkLike } from "../_shared/types.ts";
import {
  ALGAE_SOURCE,
  FDEP_ALGAE_DASHBOARD_URL,
  algaeAlertEndsAt,
  algaeAlertHash,
  algaeAlertText,
  algaeSeverity,
  fetchAlgaeSamples,
  matchAlgaeToParks,
} from "../_shared/algae.ts";

export const CRON_JOBS: readonly CronJob[] = ["usgs", "noaa", "weather", "alerts", "holidays", "prune", "algae", "parking", "stations", "forecast"];

/**
 * Per-job wall-clock budget. The cheap per-park jobs stay well inside the 60 s route
 * limit; parking and stations talk to slow third-party services (an Overpass query for
 * every park, then a USGS site lookup per unassigned park) and get the longer window
 * their pg_cron timeout allows.
 */
export const JOB_TIME_BUDGET_MS: Record<CronJob, number> = {
  usgs: 20_000,
  noaa: 20_000,
  weather: 20_000,
  alerts: 20_000,
  holidays: 20_000,
  prune: 20_000,
  algae: 20_000,
  parking: 110_000,
  stations: 110_000,
  forecast: 110_000,
};

export function isCronJob(value: string): value is CronJob {
  return (CRON_JOBS as readonly string[]).includes(value);
}

/** withSupabase hands us an untyped service-role client; rows are `any` at the edge. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;
type Json = unknown;

export interface RunJobOptions {
  /** restrict usgs/weather to one park (used by /api/refresh) */
  parkId?: string;
  /** ignore freshness throttles */
  force?: boolean;
  /** injectable clock (tests) */
  now?: Date;
  /** injectable client (tests); defaults to createAdminClient() */
  client?: Db;
  /** stop starting new per-park work after this many ms (default 50 s; route maxDuration is 60 s) */
  timeBudgetMs?: number;
}

export interface RunJobResult {
  ok: boolean;
  counts: Record<string, number>;
  errors: string[];
  /** informational messages (e.g. "USGS legacy fallback used"): not failures */
  notes?: string[];
}

/** Skip a park's weather refresh when its newest snapshot is younger than this. */
export const WEATHER_FRESH_MS = 50 * 60e3;
export const PRUNE_AFTER_MS = 7 * 24 * 3600e3;
const WEATHER_CONCURRENCY = 4;


type Ctx = { db: Db; now: Date; counts: Record<string, number>; errors: string[]; notes: string[]; opts: RunJobOptions; startedAt: number };

const msg = (err: unknown) => (err instanceof Error ? err.message : String(err));
const bump = (ctx: Ctx, key: string, n = 1) => (ctx.counts[key] = (ctx.counts[key] ?? 0) + n);
const overBudget = (ctx: Ctx) => Date.now() - ctx.startedAt > (ctx.opts.timeBudgetMs ?? 50_000);

export async function runJob(job: CronJob, opts: RunJobOptions = {}): Promise<RunJobResult> {
  const ctx: Ctx = {
    db: undefined as unknown as Db,
    now: opts.now ?? new Date(),
    counts: {},
    errors: [],
    notes: [],
    opts,
    startedAt: Date.now(),
  };
  if (!opts.client) return { ok: false, counts: {}, errors: ["no supabase client supplied"] };
  ctx.db = opts.client;
  try {
    switch (job) {
      case "usgs":
        await runUsgs(ctx);
        break;
      case "noaa":
        await runNoaa(ctx);
        break;
      case "weather":
        await runWeather(ctx);
        break;
      case "alerts":
        await runAlerts(ctx);
        break;
      case "holidays":
        await runHolidays(ctx);
        break;
      case "prune":
        await runPrune(ctx);
        break;
      case "algae":
        await runAlgae(ctx);
        break;
      case "parking":
        await runParking(ctx);
        break;
      case "stations":
        await runStations(ctx);
        break;
      case "forecast":
        await runForecast(ctx);
        break;
      default:
        return { ok: false, counts: {}, errors: [`unknown job: ${String(job)}`] };
    }
  } catch (err) {
    ctx.errors.push(`fatal (${job}): ${msg(err)}`);
    return { ok: false, counts: ctx.counts, errors: ctx.errors, notes: ctx.notes };
  }
  ctx.counts.elapsed_ms = Date.now() - ctx.startedAt;
  return { ok: true, counts: ctx.counts, errors: ctx.errors, notes: ctx.notes.length ? ctx.notes : undefined };
}

// ---------- usgs ----------

async function runUsgs(ctx: Ctx): Promise<void> {
  let q = ctx.db.from("parks").select("id,slug,name,coverage_tier,usgs_site_id,river_gauge_site_id,gauge_distance_km");
  if (ctx.opts.parkId) q = q.eq("id", ctx.opts.parkId);
  const { data: parks, error } = await q;
  if (error) throw new Error(`load parks: ${error.message}`);

  const gauged = (parks ?? []).filter((p) => p.usgs_site_id || p.river_gauge_site_id);
  const sites = [...new Set(gauged.flatMap((p) => [p.usgs_site_id, p.river_gauge_site_id]).filter((s): s is string => !!s))];
  ctx.counts.parks = gauged.length;
  ctx.counts.sites = sites.length;
  if (sites.length === 0) return;

  const result = await fetchUsgsLatestDetailed(sites, { apiKey: process.env.USGS_API_KEY || undefined, now: ctx.now });
  ctx.counts.readings = result.readings.length;
  ctx.counts.legacy_fallback = result.source === "usgs-legacy" ? 1 : 0;
  if (result.fallbackReason) ctx.notes.push(`USGS legacy fallback used: ${result.fallbackReason}`);

  const fetchedAt = ctx.now.toISOString();
  const rows = gauged.map((p) => ({
    park_id: p.id,
    source: "usgs",
    fetched_at: fetchedAt,
    payload: buildUsgsPayloadForPark(p, result.readingsBySite, fetchedAt, result.source) as unknown as Json,
  }));
  const { error: insErr, count } = await ctx.db.from("conditions_snapshots").insert(rows, { count: "exact" });
  if (insErr) throw new Error(`insert conditions_snapshots: ${insErr.message}`);
  ctx.counts.inserted = count ?? rows.length;
}

// ---------- noaa (CO-OPS tides & currents) ----------

/** Stop starting new stations after this; the pg_net timeout on the cron call is 30 s. */
export const NOAA_TIME_BUDGET_MS = 20_000;

type NoaaParkRow = { id: string; slug: string; name: string; noaa_station_id: string | null; noaa_distance_km: number | null };

/**
 * Coastal parks have no USGS river gauge, so their water temperature and tide come from the
 * NOAA CO-OPS station picked by scripts/fetch-noaa-stations.ts. Distinct stations are visited
 * once each (a station is shared by several parks) and every targeted park gets a snapshot
 * row, including one with `readings: []` when the station answered nothing, so the UI can say
 * "No live reading" instead of silently showing stale data.
 */
async function runNoaa(ctx: Ctx): Promise<void> {
  // select("*") because lib/database.types.ts (DB-owned) has not been regenerated with the
  // noaa_* columns yet; the cast below is the only place that assumes they exist.
  let q = ctx.db.from("parks").select("*");
  if (ctx.opts.parkId) q = q.eq("id", ctx.opts.parkId);
  const { data, error } = await q;
  if (error) throw new Error(`load parks: ${error.message}`);
  const parks = (data ?? []) as unknown as NoaaParkRow[];

  const coastal = parks.filter((p) => !!p.noaa_station_id);
  const stations = [...new Set(coastal.map((p) => p.noaa_station_id!))];
  ctx.counts.parks = coastal.length;
  ctx.counts.stations = stations.length;
  if (stations.length === 0) return;

  // Which products a station publishes is recorded in data/noaa_stations.json at selection time but
  // not in the DB, so every station is asked for all three; the "No data was found" envelope is a
  // soft miss, not an error.
  const results = await fetchNoaaLatest(stations, {
    now: ctx.now,
    budgetMs: Math.min(NOAA_TIME_BUDGET_MS, (ctx.opts.timeBudgetMs ?? 50_000) - (Date.now() - ctx.startedAt)),
  });

  let readings = 0;
  for (const r of Object.values(results)) {
    readings += r.readings.length;
    for (const e of r.errors) ctx.errors.push(`noaa ${r.stationId} ${e}`);
  }
  ctx.counts.readings = readings;
  ctx.counts.stations_answered = Object.values(results).filter((r) => r.readings.length > 0).length;

  const fetchedAt = ctx.now.toISOString();
  const rows = coastal
    .map((p) => {
      const payload = buildNoaaPayloadForPark(p, results, fetchedAt);
      return payload ? { park_id: p.id, source: "noaa", fetched_at: fetchedAt, payload: payload as unknown as Json } : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  if (rows.length === 0) return;

  const { error: insErr, count } = await ctx.db.from("conditions_snapshots").insert(rows, { count: "exact" });
  if (insErr) throw new Error(`insert conditions_snapshots: ${insErr.message}`);
  ctx.counts.inserted = count ?? rows.length;
}

// ---------- weather ----------

type WeatherParkRow = Pick<ParkLike, "id" | "slug" | "name" | "lat" | "lng"> & {
  coverage_tier: string;
  nws_grid: Json | null;
  nws_zone: string | null;
  nws_county: string | null;
};

async function runWeather(ctx: Ctx): Promise<void> {
  const force = ctx.opts.force === true;
  const { data: parks, error } = ctx.opts.parkId
    ? await ctx.db.from("parks").select("id,slug,name,lat,lng,coverage_tier,nws_grid,nws_zone,nws_county").eq("id", ctx.opts.parkId)
    : await ctx.db.from("parks").select("id,slug,name,lat,lng,coverage_tier,nws_grid,nws_zone,nws_county");
  if (error) throw new Error(`load parks: ${error.message}`);
  ctx.counts.parks = parks?.length ?? 0;

  // freshness: newest weather snapshot per park
  const latest = new Map<string, number>();
  if (!force) {
    const { data: rows, error: lcErr } = await ctx.db
      .from("latest_conditions")
      .select("park_id,source,fetched_at")
      .eq("source", "nws");
    if (lcErr) ctx.errors.push(`latest_conditions: ${lcErr.message}`);
    for (const r of rows ?? []) {
      if (!r.park_id || !r.fetched_at) continue;
      const t = Date.parse(r.fetched_at);
      if (!latest.has(r.park_id) || t > latest.get(r.park_id)!) latest.set(r.park_id, t);
    }
  }

  const queue = (parks ?? []).filter((p) => {
    const t = latest.get(p.id);
    const fresh = t !== undefined && ctx.now.getTime() - t < WEATHER_FRESH_MS;
    if (fresh) bump(ctx, "skipped_fresh");
    return !fresh;
  }) as WeatherParkRow[];
  // NWS covers every park. Deep-coverage parks also get the hourly grid (used by the
  // forecast strip); basic parks take the daily periods only, which halves the call count.
  ctx.counts.deep_due = queue.filter((p) => p.coverage_tier === "deep").length;
  ctx.counts.basic_due = queue.length - ctx.counts.deep_due;

  let i = 0;
  const worker = async () => {
    while (i < queue.length) {
      if (overBudget(ctx)) {
        bump(ctx, "skipped_time_budget", queue.length - i);
        i = queue.length;
        return;
      }
      await refreshParkWeather(ctx, queue[i++]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(WEATHER_CONCURRENCY, queue.length) }, worker));
}

/**
 * One park's weather from the National Weather Service.
 * There is deliberately no second provider: if NWS fails for a park we record the error and
 * leave the previous snapshot in place rather than mixing sources in the same field.
 */
async function refreshParkWeather(ctx: Ctx, park: WeatherParkRow): Promise<void> {
  const fetchedAt = new Date().toISOString();
  const grid = (park.nws_grid && typeof park.nws_grid === "object" && "forecast" in park.nws_grid ? park.nws_grid : null) as NwsGrid | null;

  let payload: Json;
  try {
    const { payload: nws, points } = await fetchNwsWeather(
      { lat: park.lat, lng: park.lng, nws_grid: grid },
      fetchedAt,
      { hourly: park.coverage_tier === "deep" },
    );
    payload = nws as unknown as Json;
    bump(ctx, "nws");
    if (points) {
      // persist the grid so later runs skip /points (grid ids are stable)
      const { error } = await ctx.db
        .from("parks")
        .update({
          nws_grid: { gridId: points.gridId, gridX: points.gridX, gridY: points.gridY, forecast: points.forecast, forecastHourly: points.forecastHourly } as unknown as Json,
          nws_zone: park.nws_zone ?? points.zone,
          nws_county: park.nws_county ?? points.county,
        })
        .eq("id", park.id);
      if (error) ctx.errors.push(`save nws grid ${park.slug}: ${error.message}`);
      else bump(ctx, "grids_saved");
    }
  } catch (err) {
    ctx.errors.push(`nws ${park.slug}: ${msg(err)}`);
    bump(ctx, "failed");
    return;
  }

  const { error } = await ctx.db.from("conditions_snapshots").insert({ park_id: park.id, source: "nws", fetched_at: fetchedAt, payload });
  if (error) {
    ctx.errors.push(`insert weather ${park.slug}: ${error.message}`);
    bump(ctx, "failed");
  } else {
    bump(ctx, "inserted");
  }
}

// ---------- alerts ----------

function alertEnd(p: NwsAlertFeature["properties"]): string | null {
  return p.ends ?? p.expires ?? null;
}

function alertText(p: NwsAlertFeature["properties"]): string {
  const headline = (p.headline ?? `${p.event}${p.areaDesc ? `: ${p.areaDesc}` : ""}`).trim();
  const desc = (p.description ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  return desc ? `${headline}. ${desc}` : headline;
}

async function runAlerts(ctx: Ctx): Promise<void> {
  const features = await fetchAlertsFL();
  ctx.counts.alerts_fl = features.length;

  const { data: parks, error } = await ctx.db.from("parks").select("id,slug,nws_zone,nws_county");
  if (error) throw new Error(`load parks: ${error.message}`);
  ctx.counts.parks = parks?.length ?? 0;

  const nowIso = ctx.now.toISOString();
  const rows = new Map<string, ParkAlertInsert>();
  for (const park of parks ?? []) {
    for (const f of matchAlertsToPark(features, park)) {
      const p = f.properties;
      const end = alertEnd(p);
      if (end && Date.parse(end) <= ctx.now.getTime()) continue; // already expired
      const hash = nwsAlertHash(park.id, p.id, p.headline ?? p.event);
      if (rows.has(hash)) continue;
      rows.set(hash, {
        park_id: park.id,
        kind: "nws",
        source: "nws",
        text: alertText(p),
        official_url: f.id && /^https?:/.test(f.id) ? f.id : `https://api.weather.gov/alerts/${p.id}`,
        severity: p.severity ?? null,
        starts_at: p.effective ?? p.onset ?? null,
        ends_at: end,
        hash,
        active: true,
        last_seen: nowIso,
        last_checked_at: nowIso,
      });
    }
  }
  ctx.counts.matched = rows.size;

  if (rows.size > 0) {
    const { error: upErr } = await ctx.db.from("park_alerts").upsert([...rows.values()], { onConflict: "hash" });
    if (upErr) throw new Error(`upsert park_alerts: ${upErr.message}`);
    ctx.counts.upserted = rows.size;
  }

  // deactivate NWS alerts that are gone or expired (manual closure/notice rows are never touched)
  const { data: active, error: actErr } = await ctx.db.from("park_alerts").select("id,hash,ends_at").eq("kind", "nws").eq("active", true);
  if (actErr) throw new Error(`load active nws alerts: ${actErr.message}`);
  const stale = (active ?? []).filter((a) => !rows.has(a.hash) || (a.ends_at && Date.parse(a.ends_at) <= ctx.now.getTime()));
  if (stale.length > 0) {
    const { error: deErr } = await ctx.db
      .from("park_alerts")
      .update({ active: false, last_checked_at: nowIso })
      .in("id", stale.map((a) => a.id));
    if (deErr) throw new Error(`deactivate park_alerts: ${deErr.message}`);
  }
  ctx.counts.deactivated = stale.length;
}

// ---------- holidays ----------

async function runHolidays(ctx: Ctx): Promise<void> {
  const year = ctx.now.getUTCFullYear();
  for (const y of [year, year + 1]) {
    try {
      const holidays = await fetchNagerHolidays(y);
      if (holidays.length) {
        const { error } = await ctx.db.from("holidays").upsert(holidays, { onConflict: "date" });
        if (error) throw new Error(`upsert holidays ${y}: ${error.message}`);
      }
      bump(ctx, "holidays", holidays.length);
    } catch (err) {
      ctx.errors.push(`holidays ${y}: ${msg(err)}`);
    }
    try {
      const weekends = await fetchLongWeekends(y);
      if (weekends.length) {
        const { error } = await ctx.db.from("long_weekends").upsert(weekends, { onConflict: "start_date" });
        if (error) throw new Error(`upsert long_weekends ${y}: ${error.message}`);
      }
      bump(ctx, "long_weekends", weekends.length);
    } catch (err) {
      ctx.errors.push(`long_weekends ${y}: ${msg(err)}`);
    }
  }
}

// ---------- algae (FDEP) ----------

async function runAlgae(ctx: Ctx): Promise<void> {
  const samples = await fetchAlgaeSamples({ now: ctx.now });
  ctx.counts.samples = samples.length;

  const { data: parks, error } = await ctx.db.from("parks").select("id,slug,lat,lng");
  if (error) throw new Error(`load parks: ${error.message}`);
  ctx.counts.parks = parks?.length ?? 0;

  // The conditions grid wants a reading for every park, not just the ones close enough to
  // warrant an alert, so the water-quality write uses its own wider radius.
  await writeWaterQuality(ctx, samples, (parks ?? []) as { id: string; lat: number; lng: number }[]);

  const nowIso = ctx.now.toISOString();
  const rows = new Map<string, ParkAlertInsert>();
  for (const m of matchAlgaeToParks(samples, parks ?? [], ctx.now)) {
    const hash = algaeAlertHash(m.park.id, m.sample.id);
    if (rows.has(hash)) continue;
    rows.set(hash, {
      park_id: m.park.id,
      kind: "notice",
      source: ALGAE_SOURCE,
      text: algaeAlertText(m.sample, m.distanceKm),
      official_url: FDEP_ALGAE_DASHBOARD_URL,
      severity: algaeSeverity(m.sample),
      starts_at: m.sample.sampledAt,
      ends_at: algaeAlertEndsAt(m.sample),
      hash,
      active: true,
      last_seen: nowIso,
      last_checked_at: nowIso,
    });
  }
  ctx.counts.matched = rows.size;

  if (rows.size > 0) {
    const { error: upErr } = await ctx.db.from("park_alerts").upsert([...rows.values()], { onConflict: "hash" });
    if (upErr) throw new Error(`upsert park_alerts: ${upErr.message}`);
    ctx.counts.upserted = rows.size;
  }

  // deactivate samples that aged out of the window or vanished from the feed (manual rows untouched)
  const { data: active, error: actErr } = await ctx.db.from("park_alerts").select("id,hash,ends_at").eq("source", ALGAE_SOURCE).eq("active", true);
  if (actErr) throw new Error(`load active algae alerts: ${actErr.message}`);
  const stale = (active ?? []).filter((a) => !rows.has(a.hash) || (a.ends_at && Date.parse(a.ends_at) <= ctx.now.getTime()));
  if (stale.length > 0) {
    const { error: deErr } = await ctx.db
      .from("park_alerts")
      .update({ active: false, last_checked_at: nowIso })
      .in("id", stale.map((a) => a.id));
    if (deErr) throw new Error(`deactivate algae alerts: ${deErr.message}`);
  }
  ctx.counts.deactivated = stale.length;
}

// ---------- prune ----------

/**
 * Water quality for every park, from the nearest recent FDEP/FWC sample.
 *
 * Parks with no sample in range are set back to null rather than left holding a stale
 * reading: "we don't know" is the honest answer once the sample ages out, and the tile
 * hides itself rather than printing a caveat.
 */
async function writeWaterQuality(
  ctx: Ctx,
  samples: Parameters<typeof nearestSample>[0],
  parks: { id: string; lat: number; lng: number }[],
): Promise<void> {
  let matched = 0;
  for (const park of parks) {
    const quality = waterQualityFor(nearestSample(samples, park, WATER_QUALITY_MATCH_KM));
    if (quality) matched += 1;
    const { error } = await ctx.db
      .from("park_forecast")
      .update({ water_quality: quality as unknown as Json })
      .eq("park_id", park.id);
    if (error) {
      ctx.errors.push(`water_quality ${park.id}: ${error.message}`);
      return;
    }
  }
  ctx.counts.water_quality = matched;
}

// ---------- forecast (NWS weather + gridpoint + EPA UV) ----------

/** Parks per concurrent wave. Small waves keep the worker well inside its resource limit. */
export const FORECAST_BATCH = 5;

/**
 * Build one park_forecast row per park and upsert them in a single statement.
 *
 * Three upstreams per park (NWS forecast, NWS gridpoint, EPA UV), so the work is done in
 * waves of FORECAST_BATCH with Promise.allSettled rather than all at once: a statewide
 * fan-out is what trips WORKER_RESOURCE_LIMIT. One park failing costs that park's row and
 * nothing else.
 */
async function runForecast(ctx: Ctx): Promise<void> {
  let q = ctx.db.from("parks").select("id,slug,name,lat,lng,coverage_tier,nws_grid,nws_zone,nws_county");
  if (ctx.opts.parkId) q = q.eq("id", ctx.opts.parkId);
  const { data, error } = await q;
  if (error) throw new Error(`load parks: ${error.message}`);
  const parks = (data ?? []) as unknown as ForecastPark[];
  ctx.counts.parks = parks.length;
  if (parks.length === 0) return;

  const rows: Record<string, unknown>[] = [];
  let withUv = 0;

  for (let i = 0; i < parks.length; i += FORECAST_BATCH) {
    if (overBudget(ctx)) {
      ctx.notes.push(`time budget reached after ${i} of ${parks.length} parks`);
      break;
    }
    const wave = parks.slice(i, i + FORECAST_BATCH);
    // Every park gets the hourly series, regardless of coverage tier: the UV curve and the
    // feels-like line are the same product on every page, and a park missing them would be
    // visibly second class.
    const settled = await Promise.allSettled(wave.map((park) => assembleForecast(park, { now: ctx.now })));
    settled.forEach((r, j) => {
      if (r.status === "fulfilled") {
        if (r.value.now_uv != null) withUv += 1;
        // water_quality is owned by the algae job, so it is left out of this upsert.
        const row = { ...r.value } as Partial<typeof r.value>;
        delete row.water_quality;
        rows.push(row as unknown as Record<string, unknown>);
      } else {
        ctx.errors.push(`forecast ${wave[j]?.slug}: ${msg(r.reason)}`);
      }
    });
  }

  ctx.counts.built = rows.length;
  ctx.counts.uv = withUv;
  ctx.counts.failed = ctx.errors.length;
  if (rows.length === 0) return;

  const { error: upErr, count } = await ctx.db
    .from("park_forecast")
    .upsert(rows, { onConflict: "park_id", count: "exact" });
  if (upErr) throw new Error(`upsert park_forecast: ${upErr.message}`);
  ctx.counts.upserted = count ?? rows.length;
}

// ---------- parking (OpenStreetMap via Overpass) ----------

/** Parks covered per parking run. A full sweep does not fit in one invocation. */
export const PARKING_PARKS_PER_RUN = 24;

/**
 * Refresh OpenStreetMap parking for a slice of parks, least-recently-checked first.
 *
 * Overpass is slow and its mirrors are unreliable, so this is deliberately bounded:
 * a daily run covers PARKING_PARKS_PER_RUN parks and stamps parks.osm_checked_at, and
 * the whole state cycles every few days.
 *
 * Because the batch is known, the prune is exact: OSM lots belonging to these parks
 * that Overpass no longer returns are gone, and no other park's lots are touched.
 */
async function runParking(ctx: Ctx): Promise<void> {
  let q = ctx.db
    .from("parks")
    .select("id,slug,name,lat,lng")
    .order("osm_checked_at", { ascending: true, nullsFirst: true })
    .limit(PARKING_PARKS_PER_RUN);
  if (ctx.opts.parkId) q = ctx.db.from("parks").select("id,slug,name,lat,lng").eq("id", ctx.opts.parkId);

  const { data: parks, error } = await q;
  if (error) throw new Error(`load parks: ${error.message}`);
  const batch = (parks ?? []) as { id: string; slug: string; name: string; lat: number; lng: number }[];
  ctx.counts.parks = batch.length;
  if (batch.length === 0) return;

  const response = await fetchParkingElements(batch, { deadlineMs: 60_000 });
  ctx.counts.elements = (response.elements ?? []).length;
  if (response.partial) ctx.notes.push(`partial overpass sweep: ${(response.failures ?? []).join("; ")}`);

  const rows = groupParkingByPark(response, batch);
  ctx.counts.matched = rows.length;

  if (rows.length > 0) {
    const { error: upsertError, count } = await ctx.db
      .from("parking_lots")
      .upsert(rows, { onConflict: "osm_ref", count: "exact" });
    if (upsertError) throw new Error(`upsert parking_lots: ${upsertError.message}`);
    ctx.counts.upserted = count ?? rows.length;
  }

  // Drop OSM lots for these parks that Overpass no longer returns: but never on a
  // partial sweep, where a missing lot only means a chunk failed.
  if (!response.partial) {
    const keep = rows.map((r) => r.osm_ref);
    let del = ctx.db
      .from("parking_lots")
      .delete({ count: "exact" })
      .eq("source", "osm")
      .in("park_id", batch.map((p) => p.id));
    if (keep.length > 0) del = del.not("osm_ref", "in", `(${keep.map((k) => `"${k}"`).join(",")})`);
    const { error: deleteError, count: deleted } = await del;
    if (deleteError) ctx.errors.push(`prune osm parking_lots: ${deleteError.message}`);
    else ctx.counts.removed = deleted ?? 0;
  }

  // Stamp only when the sweep was complete, so a failed chunk is retried tomorrow.
  if (!response.partial) {
    const { error: stampError } = await ctx.db
      .from("parks")
      .update({ osm_checked_at: ctx.now.toISOString() })
      .in("id", batch.map((p) => p.id));
    if (stampError) ctx.errors.push(`stamp osm_checked_at: ${stampError.message}`);
  }
}

// ---------- stations (gauge / tide station / NWS grid assignment) ----------

/**
 * Fill in missing station assignments. Curated ones are never overwritten: a park that
 * already has a gauge, a tide station or a grid is skipped entirely.
 *
 * Ordered cheapest-first so a run that hits the time budget still makes progress: the
 * NWS grid is one request per park, NOAA needs a single station list for all of them,
 * and USGS needs a site lookup plus a liveness check per park.
 */
async function runStations(ctx: Ctx): Promise<void> {
  const { data: parks, error } = await ctx.db
    .from("parks")
    .select("id,slug,name,type,lat,lng,nws_grid,nws_zone,nws_county,usgs_site_id,river_gauge_site_id,noaa_station_id");
  if (error) throw new Error(`load parks: ${error.message}`);
  const list = (parks ?? []) as {
    id: string;
    slug: string;
    name: string;
    type: string | null;
    lat: number;
    lng: number;
    nws_grid: unknown;
    usgs_site_id: string | null;
    river_gauge_site_id: string | null;
    noaa_station_id: string | null;
  }[];
  ctx.counts.parks = list.length;

  // 1. NWS grid: one /points call per park that has none.
  for (const park of list.filter((p) => !p.nws_grid)) {
    if (overBudget(ctx)) {
      ctx.notes.push("time budget reached during nws grid backfill");
      return;
    }
    try {
      const grid = await assignNwsGrid(park);
      const { error: updateError } = await ctx.db.from("parks").update(grid).eq("id", park.id);
      if (updateError) throw new Error(updateError.message);
      bump(ctx, "nws_grid");
    } catch (err) {
      ctx.errors.push(`nws grid ${park.slug}: ${msg(err)}`);
    }
  }

  // 2. NOAA tide/water-temp station: coastal parks with no USGS gauge and no station yet.
  const needStation = list.filter((p) => !p.noaa_station_id && !p.usgs_site_id && !p.river_gauge_site_id);
  if (needStation.length > 0 && !overBudget(ctx)) {
    try {
      const candidates = await fetchNoaaStationCandidates();
      ctx.counts.noaa_candidates = candidates.length;
      for (const park of needStation) {
        const best = nearestStation(park, candidates);
        if (!best) continue;
        const { error: updateError } = await ctx.db
          .from("parks")
          .update({ noaa_station_id: best.station.id, noaa_distance_km: Math.round(best.km * 10) / 10 })
          .eq("id", park.id);
        if (updateError) {
          ctx.errors.push(`noaa station ${park.slug}: ${updateError.message}`);
          continue;
        }
        bump(ctx, "noaa_station");
      }
    } catch (err) {
      ctx.errors.push(`noaa stations: ${msg(err)}`);
    }
  }

  // 3. USGS gauges: inland parks with nothing assigned.
  for (const park of list.filter((p) => !p.usgs_site_id && !p.river_gauge_site_id && !p.noaa_station_id)) {
    if (overBudget(ctx)) {
      ctx.notes.push("time budget reached during usgs gauge backfill");
      return;
    }
    try {
      const gauges = await assignGauges(park, ctx.now);
      if (!gauges) continue;
      const { error: updateError } = await ctx.db.from("parks").update(gauges).eq("id", park.id);
      if (updateError) throw new Error(updateError.message);
      bump(ctx, "usgs_gauge");
    } catch (err) {
      ctx.errors.push(`usgs gauge ${park.slug}: ${msg(err)}`);
    }
  }
}

async function runPrune(ctx: Ctx): Promise<void> {
  const cutoff = new Date(ctx.now.getTime() - PRUNE_AFTER_MS).toISOString();
  const { error, count } = await ctx.db.from("conditions_snapshots").delete({ count: "exact" }).lt("fetched_at", cutoff);
  if (error) throw new Error(`prune conditions_snapshots: ${error.message}`);
  ctx.counts.deleted = count ?? 0;
}


// ---------- HTTP entrypoint ----------

/**
 * pg_cron (via pg_net) and the app's /api/refresh both POST here with the project's
 * sb_secret_ key in the `apikey` header. Secret keys are not JWTs, so config.toml sets
 * verify_jwt = false and withSupabase({ auth: "secret" }) validates the key itself.
 *
 * Body: { source: CronJob | "all", park_id?: uuid, force?: boolean }
 * 200:  { ok, source, ranAt, counts, errors }
 */
const ALL_SOURCES: readonly CronJob[] = ["weather", "noaa", "usgs", "alerts"];

const handler = {
  fetch: withSupabase({ auth: "secret" }, async (req: Request, ctx: SupabaseContext): Promise<Response> => {
    if (req.method !== "POST" && req.method !== "GET") {
      return Response.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
    }
    const body = (await req.json().catch(() => ({}))) as { source?: unknown; park_id?: unknown; force?: unknown };
    const url = new URL(req.url);
    const raw = typeof body.source === "string" ? body.source : (url.searchParams.get("source") ?? "all");
    const parkId = typeof body.park_id === "string" ? body.park_id : (url.searchParams.get("park_id") ?? undefined);
    const force = body.force === true || url.searchParams.get("force") === "1";
    const ranAt = new Date().toISOString();
    const client = ctx.supabaseAdmin as unknown as Db;

    const jobs: CronJob[] = raw === "all" ? [...ALL_SOURCES] : isCronJob(raw) ? [raw] : [];
    if (jobs.length === 0) {
      return Response.json({ ok: false, source: raw, ranAt, counts: {}, errors: [`unknown source: ${raw}`] }, { status: 400 });
    }

    const counts: Record<string, number> = {};
    const errors: string[] = [];
    let ok = true;
    for (const job of jobs) {
      const result = await runJob(job, { client, parkId, force, timeBudgetMs: JOB_TIME_BUDGET_MS[job] ?? 20_000 });
      ok = ok && result.ok;
      for (const [k, v] of Object.entries(result.counts)) counts[jobs.length > 1 ? `${job}_${k}` : k] = v;
      errors.push(...result.errors.map((e) => (jobs.length > 1 ? `${job}: ${e}` : e)));
    }
    return Response.json({ ok, source: raw, ranAt, counts, errors });
  }),
};

export default handler;
