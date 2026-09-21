/**
 * GET /api/search?q=ichetucknee
 *
 * Park name search across the whole database, as list cards. The pages carry a bounded set
 * of parks, so without this a search could only find what happened to be in that set.
 */
import type { NextRequest } from "next/server";
import { searchParks } from "@/lib/queries";

export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<Response> {
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
  const parks = await searchParks(q);
  return Response.json(
    { parks },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
