/**
 * GET /api/map-points?bbox=west,south,east,north
 *
 * Pins for the viewport the map is looking at. This exists because the map used to receive
 * every park in the country in the page itself, which was 1.95 MB gzipped once the lake
 * harvest found 22,679 of them.
 *
 * Cached at the edge for a minute, the same window the pages use, because two people
 * looking at the same part of the country should not both compute it.
 */
import type { NextRequest } from "next/server";
import { getMapPoints } from "@/lib/queries";
import { parseBbox } from "@/lib/mapPoints";

export const runtime = "nodejs";
/** Same freshness as the pages: a status that changes on the hour does not need seconds. */
export const revalidate = 60;

export async function GET(req: NextRequest): Promise<Response> {
  const bbox = parseBbox(req.nextUrl.searchParams.get("bbox"));
  if (!bbox) {
    return Response.json({ error: "bbox must be west,south,east,north" }, { status: 400 });
  }
  const result = await getMapPoints(bbox);
  return Response.json(result, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
