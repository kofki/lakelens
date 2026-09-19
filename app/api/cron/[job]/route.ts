/**
 * GET/POST /api/cron/{usgs|noaa|weather|alerts|holidays|prune|algae}
 *
 * Called by Supabase pg_cron (pg_net) and by hand with `Authorization: Bearer $CRON_SECRET`.
 * Optional query: ?force=1 (ignore freshness throttles), ?park_id=<uuid> (usgs/noaa/weather only).
 * Response: { job, ranAt, ok, counts, errors, notes? } — 200 when the job ran (even with per-park
 * errors listed), 500 when it could not run at all, 401 without the secret, 400 for an unknown job.
 */
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { CRON_JOBS, isCronJob, runJob } from "@/lib/ingest/run";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  return safeEqual(header, `Bearer ${secret}`);
}

async function handle(req: NextRequest, ctx: { params: Promise<{ job: string }> }): Promise<Response> {
  if (!authorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { job } = await ctx.params;
  if (!isCronJob(job)) {
    return Response.json({ ok: false, error: `unknown job "${job}"`, jobs: CRON_JOBS }, { status: 400 });
  }
  const url = new URL(req.url);
  const forceParam = url.searchParams.get("force");
  const force = forceParam === "1" || forceParam === "true";
  const parkId = url.searchParams.get("park_id") ?? undefined;

  const result = await runJob(job, { force, parkId });
  return Response.json({ job, ranAt: new Date().toISOString(), ...result }, { status: result.ok ? 200 : 500 });
}

export const GET = handle;
export const POST = handle;
