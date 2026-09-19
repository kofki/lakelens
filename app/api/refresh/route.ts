/**
 * POST /api/refresh  { park_id: uuid, sources?: ("usgs" | "weather")[] }
 *
 * On-demand refresh used by the park page when its data looks stale. Public (no secret) but
 * throttled: one run per park per 5 minutes (module-level map, per server instance) plus a
 * small global rate cap. Runs the usgs + weather jobs for that park only, with force=true.
 * Response: { ok, throttled, park_id, ranAt, counts: { usgs?, weather? }, errors }.
 */
import type { NextRequest } from "next/server";
import { runJob, type RunJobResult } from "@/lib/ingest/run";
import type { CronJob } from "@/lib/types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const THROTTLE_MS = 5 * 60e3;
const GLOBAL_CAP_PER_MIN = 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFRESH_SOURCES = ["usgs", "weather"] as const;
type RefreshSource = (typeof REFRESH_SOURCES)[number];

/** park_id -> last run (ms). Lives for the lifetime of the server instance; that is fine for a throttle. */
const lastRun = new Map<string, number>();
const recentRuns: number[] = [];

function pruneMaps(now: number): void {
  for (const [id, t] of lastRun) if (now - t > THROTTLE_MS) lastRun.delete(id);
  while (recentRuns.length && now - recentRuns[0] > 60e3) recentRuns.shift();
}

export async function POST(req: NextRequest): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { park_id?: unknown; sources?: unknown } | null;
  const parkId = typeof body?.park_id === "string" ? body.park_id.trim() : "";
  if (!UUID_RE.test(parkId)) {
    return Response.json({ ok: false, error: "park_id must be a uuid" }, { status: 400 });
  }
  const sources: RefreshSource[] = Array.isArray(body?.sources)
    ? (body!.sources as unknown[]).filter((s): s is RefreshSource => typeof s === "string" && (REFRESH_SOURCES as readonly string[]).includes(s))
    : [...REFRESH_SOURCES];
  if (sources.length === 0) {
    return Response.json({ ok: false, error: `sources must include one of ${REFRESH_SOURCES.join(", ")}` }, { status: 400 });
  }

  const now = Date.now();
  pruneMaps(now);
  const last = lastRun.get(parkId);
  if (last !== undefined && now - last < THROTTLE_MS) {
    const nextAllowedAt = new Date(last + THROTTLE_MS);
    return Response.json(
      { ok: true, throttled: true, park_id: parkId, nextAllowedAt: nextAllowedAt.toISOString(), counts: {}, errors: [] },
      { status: 200, headers: { "Retry-After": String(Math.ceil((last + THROTTLE_MS - now) / 1000)) } },
    );
  }
  if (recentRuns.length >= GLOBAL_CAP_PER_MIN) {
    return Response.json({ ok: false, throttled: true, error: "too many refreshes, try again in a minute" }, { status: 429, headers: { "Retry-After": "60" } });
  }
  lastRun.set(parkId, now);
  recentRuns.push(now);

  const results = await Promise.all(sources.map((s) => runJob(s as CronJob, { parkId, force: true })));
  const counts: Partial<Record<RefreshSource, RunJobResult["counts"]>> = {};
  const errors: string[] = [];
  let ok = true;
  results.forEach((r, i) => {
    counts[sources[i]] = r.counts;
    errors.push(...r.errors.map((e) => `${sources[i]}: ${e}`));
    ok &&= r.ok;
  });

  return Response.json({ ok, throttled: false, park_id: parkId, ranAt: new Date(now).toISOString(), counts, errors }, { status: 200 });
}
