/**
 * Ingestion job runner (server only — uses the admin client).
 *
 *   usgs     batched USGS calls (40 sites/request) for every distinct gauge of EVERY park with a gauge
 *            -> one conditions_snapshots(source=usgs) row per gauged park
 *   weather  EVERY park every run. Deep parks: NWS (Open-Meteo fallback), 4 in parallel. Basic parks:
 *            Open-Meteo multi-location batches of 20, sequential (429-safe), one insert per batch.
 *            A park is skipped when its latest weather snapshot is < 50 min old (unless force).
 *   alerts   ONE statewide NWS call -> park_alerts(kind=nws) upsert by hash; stale/expired rows -> active=false
 *   algae    FDEP algal bloom samples (21 days) within 3 km -> park_alerts(kind=notice, source=fdep-algae)
 *   holidays refresh holidays + long_weekends for this year and next (Nager.Date)
 *   prune    delete conditions_snapshots older than 7 days
 *
 * Every job is idempotent and never throws: failures are returned in `errors`. `ok` is false only when the
 * job could not run at all (bad env, fatal exception).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CronJob, NwsGrid, Park } from "@/lib/types";
import { buildUsgsPayloadForPark, fetchUsgsLatestDetailed } from "./usgs";
import { fetchAlertsFL, fetchNwsWeather, matchAlertsToPark, type NwsAlertFeature } from "./nws";
import { OPEN_METEO_BATCH_SIZE, fetchOpenMeteo, fetchOpenMeteoBatch } from "./openMeteo";
import { fetchLongWeekends, fetchNagerHolidays } from "./holidays";
import { nwsAlertHash } from "./hash";
import {
  ALGAE_SOURCE,
  FDEP_ALGAE_DASHBOARD_URL,
  algaeAlertEndsAt,
  algaeAlertHash,
  algaeAlertText,
  algaeSeverity,
  fetchAlgaeSamples,
  matchAlgaeToParks,
} from "./algae";

export const CRON_JOBS: readonly CronJob[] = ["usgs", "weather", "alerts", "holidays", "prune", "algae"];

export function isCronJob(value: string): value is CronJob {
  return (CRON_JOBS as readonly string[]).includes(value);
}

export interface RunJobOptions {
  /** restrict usgs/weather to one park (used by /api/refresh) */
  parkId?: string;
  /** ignore freshness throttles */
  force?: boolean;
  /** injectable clock (tests) */
  now?: Date;
  /** injectable client (tests); defaults to createAdminClient() */
  client?: SupabaseClient<Database>;
  /** stop starting new per-park work after this many ms (default 50 s; route maxDuration is 60 s) */
  timeBudgetMs?: number;
}

export interface RunJobResult {
  ok: boolean;
  counts: Record<string, number>;
  errors: string[];
  /** informational messages (e.g. "USGS legacy fallback used") — not failures */
  notes?: string[];
}

/** Skip a park's weather refresh when its newest snapshot is younger than this. */
export const WEATHER_FRESH_MS = 50 * 60e3;
export const PRUNE_AFTER_MS = 7 * 24 * 3600e3;
const WEATHER_CONCURRENCY = 4;

type Db = SupabaseClient<Database>;
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
  try {
    ctx.db = opts.client ?? createAdminClient();
  } catch (err) {
    return { ok: false, counts: {}, errors: [`admin client: ${msg(err)}`] };
  }
  try {
    switch (job) {
      case "usgs":
        await runUsgs(ctx);
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

// ---------- weather ----------

type WeatherParkRow = Pick<Park, "id" | "slug" | "name" | "lat" | "lng"> & {
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
      .in("source", ["nws", "open-meteo"]);
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
  const deep = queue.filter((p) => p.coverage_tier === "deep");
  const basic = queue.filter((p) => p.coverage_tier !== "deep");
  ctx.counts.deep_due = deep.length;
  ctx.counts.basic_due = basic.length;

  // deep parks: NWS with per-park Open-Meteo fallback, a few in parallel
  let i = 0;
  const worker = async () => {
    while (i < deep.length) {
      if (overBudget(ctx)) {
        bump(ctx, "skipped_time_budget", deep.length - i);
        i = deep.length;
        return;
      }
      await refreshParkWeather(ctx, deep[i++]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(WEATHER_CONCURRENCY, deep.length) }, worker));

  // basic parks: Open-Meteo multi-location batches, sequential so we never trip its burst limit
  for (let start = 0; start < basic.length; start += OPEN_METEO_BATCH_SIZE) {
    if (overBudget(ctx)) {
      bump(ctx, "skipped_time_budget", basic.length - start);
      break;
    }
    const batch = basic.slice(start, start + OPEN_METEO_BATCH_SIZE);
    await refreshBasicWeatherBatch(ctx, batch);
  }
}

/** One Open-Meteo request + one insert for up to OPEN_METEO_BATCH_SIZE basic parks. */
async function refreshBasicWeatherBatch(ctx: Ctx, batch: WeatherParkRow[]): Promise<void> {
  const fetchedAt = new Date().toISOString();
  bump(ctx, "open_meteo_batches");
  try {
    const payloads = await fetchOpenMeteoBatch(
      batch.map((p) => ({ lat: p.lat, lng: p.lng })),
      { fetchedAt },
    );
    const rows = batch.map((p, idx) => ({ park_id: p.id, source: "open-meteo", fetched_at: fetchedAt, payload: payloads[idx] as unknown as Json }));
    const { error } = await ctx.db.from("conditions_snapshots").insert(rows);
    if (error) throw new Error(`insert weather batch: ${error.message}`);
    bump(ctx, "open_meteo", batch.length);
    bump(ctx, "inserted", batch.length);
  } catch (err) {
    ctx.errors.push(`open-meteo batch (${batch[0]?.slug}…, ${batch.length} parks): ${msg(err)}`);
    bump(ctx, "failed", batch.length);
  }
}

async function refreshParkWeather(ctx: Ctx, park: WeatherParkRow): Promise<void> {
  const fetchedAt = new Date().toISOString();
  const grid = (park.nws_grid && typeof park.nws_grid === "object" && "forecast" in park.nws_grid ? park.nws_grid : null) as NwsGrid | null;
  let payload: Json | null = null;
  let source: "nws" | "open-meteo" = "nws";

  try {
    const { payload: nws, points } = await fetchNwsWeather({ lat: park.lat, lng: park.lng, nws_grid: grid }, fetchedAt);
    payload = nws as unknown as Json;
    bump(ctx, "nws");
    if (points) {
      // persist the grid so later runs skip /points (cache 24 h upstream; grid ids are stable)
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
    try {
      payload = (await fetchOpenMeteo(park.lat, park.lng, { fetchedAt })) as unknown as Json;
      source = "open-meteo";
      bump(ctx, "open_meteo");
    } catch (err2) {
      ctx.errors.push(`open-meteo ${park.slug}: ${msg(err2)}`);
      bump(ctx, "failed");
      return;
    }
  }

  const { error } = await ctx.db.from("conditions_snapshots").insert({ park_id: park.id, source, fetched_at: fetchedAt, payload: payload! });
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
  const headline = (p.headline ?? `${p.event}${p.areaDesc ? ` — ${p.areaDesc}` : ""}`).trim();
  const desc = (p.description ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  return desc ? `${headline} — ${desc}` : headline;
}

async function runAlerts(ctx: Ctx): Promise<void> {
  const features = await fetchAlertsFL();
  ctx.counts.alerts_fl = features.length;

  const { data: parks, error } = await ctx.db.from("parks").select("id,slug,nws_zone,nws_county");
  if (error) throw new Error(`load parks: ${error.message}`);
  ctx.counts.parks = parks?.length ?? 0;

  const nowIso = ctx.now.toISOString();
  const rows = new Map<string, Database["public"]["Tables"]["park_alerts"]["Insert"]>();
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

  const nowIso = ctx.now.toISOString();
  const rows = new Map<string, Database["public"]["Tables"]["park_alerts"]["Insert"]>();
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

async function runPrune(ctx: Ctx): Promise<void> {
  const cutoff = new Date(ctx.now.getTime() - PRUNE_AFTER_MS).toISOString();
  const { error, count } = await ctx.db.from("conditions_snapshots").delete({ count: "exact" }).lt("fetched_at", cutoff);
  if (error) throw new Error(`prune conditions_snapshots: ${error.message}`);
  ctx.counts.deleted = count ?? 0;
}
