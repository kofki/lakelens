/**
 * GET /api/parks/{id}/flow-history?hours=24|72
 *
 * Proxies the USGS OGC "continuous" collection for the park's primary discharge (00060) gauge —
 * the park's own gauge first, then its river gauge — falling back to gage height (00065) when no
 * discharge series exists. Public (no secret); the park is looked up with the publishable-key client.
 * Response: { park_id, site, parameter, unit, hours, fetchedAt, points: [{ t, v }] } — `site` is null and
 * `points` empty for a park without a gauge or without readings in the window.
 * Cached at the CDN: public, s-maxage=1800, stale-while-revalidate=3600.
 */
import type { NextRequest } from "next/server";
import { createPublicClient } from "@/lib/supabase/server";
import { fetchFlowHistory, normalizeSiteId, type FlowHistory, type FlowParameter } from "@/lib/ingest/usgs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_HOURS = [24, 72] as const;
const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" };

function json(body: unknown, status = 200, cache = true): Response {
  return Response.json(body, { status, headers: cache ? CACHE_HEADERS : { "Cache-Control": "no-store" } });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return json({ ok: false, error: "id must be a park uuid" }, 400, false);
  const hoursParam = Number(new URL(req.url).searchParams.get("hours") ?? "24");
  const hours = (ALLOWED_HOURS as readonly number[]).includes(hoursParam) ? hoursParam : 24;

  const db = createPublicClient();
  const { data: park, error } = await db.from("parks").select("id,usgs_site_id,river_gauge_site_id").eq("id", id).maybeSingle();
  if (error) return json({ ok: false, error: error.message }, 500, false);
  if (!park) return json({ ok: false, error: "park not found" }, 404, false);

  const sites = [...new Set([park.usgs_site_id, park.river_gauge_site_id].filter((s): s is string => !!s).map(normalizeSiteId))];
  const fetchedAt = new Date().toISOString();
  const base = { ok: true, park_id: park.id, hours, fetchedAt };
  if (sites.length === 0) return json({ ...base, site: null, parameter: null, unit: null, points: [] });

  const apiKey = process.env.USGS_API_KEY || undefined;
  let history: FlowHistory | null = null;
  const errors: string[] = [];
  // discharge from any of the park's gauges beats level from the nearest one
  for (const parameter of ["00060", "00065"] as FlowParameter[]) {
    for (const site of sites) {
      try {
        history = await fetchFlowHistory(site, hours, { apiKey, parameter });
      } catch (err) {
        errors.push(`${site}/${parameter}: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (history) break;
    }
    if (history) break;
  }

  if (!history) {
    // upstream failure: short cache so a blip does not stick for 30 min
    if (errors.length && errors.length === sites.length * 2) {
      return Response.json({ ...base, site: null, parameter: null, unit: null, points: [], errors }, { status: 502, headers: { "Cache-Control": "public, s-maxage=60" } });
    }
    return json({ ...base, site: sites[0], parameter: null, unit: null, points: [] });
  }
  return json({ ...base, site: history.site, parameter: history.parameter, unit: history.unit, points: history.points });
}
