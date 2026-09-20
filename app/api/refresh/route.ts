/**
 * POST /api/refresh  { park_id: uuid, sources?: ("usgs" | "noaa" | "weather")[] }
 *
 * On-demand refresh used by the park page when its data looks stale. All ingestion lives in
 * the `refresh-conditions` Supabase Edge Function (which pg_cron also drives), so this route
 * is just an authenticated proxy: it holds the secret key server-side and throttles callers.
 *
 * Public (no secret from the browser) but throttled: one run per park per 5 minutes plus a
 * global cap, both per server instance — enough to stop a page refresh loop from hammering
 * NWS/NOAA/USGS. A park only ever has one of usgs / noaa, so the unused one inserts nothing.
 *
 * Response: { ok, throttled, park_id, ranAt, counts, errors }.
 */
import type { NextRequest } from "next/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const THROTTLE_MS = 5 * 60e3;
const GLOBAL_CAP_PER_MIN = 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFRESH_SOURCES = ["usgs", "noaa", "weather"] as const;
type RefreshSource = (typeof REFRESH_SOURCES)[number];

/** park_id -> last run (ms). Lives for the lifetime of the server instance; that is fine for a throttle. */
const lastRun = new Map<string, number>();
const recentRuns: number[] = [];

function pruneMaps(now: number): void {
  for (const [id, t] of lastRun) if (now - t > THROTTLE_MS) lastRun.delete(id);
  while (recentRuns.length && now - recentRuns[0] > 60e3) recentRuns.shift();
}

interface EdgeResult {
  ok?: boolean;
  counts?: Record<string, number>;
  errors?: string[];
}

/** Calls the Edge Function with the project's secret key (never exposed to the browser). */
async function invokeEdge(source: RefreshSource, parkId: string): Promise<EdgeResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return { ok: false, errors: ["refresh is not configured on this deployment"] };
  const res = await fetch(`${url}/functions/v1/refresh-conditions`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ source, park_id: parkId, force: true }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as EdgeResult | null;
  if (!res.ok) return { ok: false, errors: [`edge ${source}: HTTP ${res.status}`, ...(body?.errors ?? [])] };
  return body ?? { ok: false, errors: [`edge ${source}: empty response`] };
}

export async function POST(req: NextRequest): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { park_id?: unknown; sources?: unknown } | null;
  const parkId = typeof body?.park_id === "string" ? body.park_id.trim() : "";
  if (!UUID_RE.test(parkId)) {
    return Response.json({ ok: false, error: "park_id must be a uuid" }, { status: 400 });
  }
  const sources: RefreshSource[] = Array.isArray(body?.sources)
    ? (body.sources as unknown[]).filter((s): s is RefreshSource => typeof s === "string" && (REFRESH_SOURCES as readonly string[]).includes(s))
    : [...REFRESH_SOURCES];
  if (sources.length === 0) {
    return Response.json({ ok: false, error: "no valid sources" }, { status: 400 });
  }

  const now = Date.now();
  pruneMaps(now);
  const last = lastRun.get(parkId);
  if (last !== undefined && now - last < THROTTLE_MS) {
    return Response.json(
      { ok: true, throttled: true, park_id: parkId, ranAt: new Date(last).toISOString(), counts: {}, errors: [] },
      { status: 200 },
    );
  }
  if (recentRuns.length >= GLOBAL_CAP_PER_MIN) {
    return Response.json({ ok: false, throttled: true, error: "too many refreshes, try again in a minute" }, { status: 429, headers: { "Retry-After": "60" } });
  }
  lastRun.set(parkId, now);
  recentRuns.push(now);

  const results = await Promise.all(sources.map((s) => invokeEdge(s, parkId)));
  const counts: Partial<Record<RefreshSource, Record<string, number>>> = {};
  const errors: string[] = [];
  let ok = true;
  results.forEach((r, i) => {
    counts[sources[i]] = r.counts ?? {};
    errors.push(...(r.errors ?? []).map((e) => `${sources[i]}: ${e}`));
    ok &&= r.ok !== false;
  });

  return Response.json({ ok, throttled: false, park_id: parkId, ranAt: new Date(now).toISOString(), counts, errors }, { status: 200 });
}
