/**
 * POST /api/reports — fallback write path (NEXT_PUBLIC_REPORTS_VIA=api) mirroring the
 * Supabase Edge Function `submit-report`.
 *
 *   report:        { park_id, category, value, note?, photo_url?, device_id }
 *                  -> 201 { ok: true, report, ...report }   (row fields spread for parity with the Edge Function)
 *   confirmation:  { type: "confirmation", report_id, device_id, response: "still_true" | "no_longer" }
 *                  -> 201 { ok: true, confirmation }
 *   400 invalid payload · 404 unknown report · 429 rate limited (5 reports / 10 min / device)
 *
 * Inserts use the admin client (service role); is_sample is always false; note is trimmed to 280.
 * The DB trigger enforce_report_rate_limit is the backstop (its P0001 error also maps to 429).
 */
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { REPORT_VALUES, type ReportCategory, type ReportValue } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REPORT_LIMIT = 5;
const CONFIRM_LIMIT = 20;
const WINDOW_MIN = 10;
const NOTE_MAX = 280;
const RESPONSES = ["still_true", "no_longer"] as const;

const bad = (error: string, status = 400, extra: Record<string, unknown> = {}) =>
  Response.json({ ok: false, error, ...extra }, { status });

const rateLimited = () =>
  Response.json(
    { ok: false, error: "rate_limited", retry_after_min: WINDOW_MIN },
    { status: 429, headers: { "Retry-After": String(WINDOW_MIN * 60) } },
  );

function photoUrlAllowed(url: string): boolean {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) return false;
  return url.startsWith(`${base}/storage/v1/object/public/report-photos/`);
}

export async function POST(req: NextRequest): Promise<Response> {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return bad("body must be JSON");
  if (body.type === "confirmation") return handleConfirmation(body);
  return handleReport(body);
}

async function handleReport(body: Record<string, unknown>): Promise<Response> {
  const parkId = typeof body.park_id === "string" ? body.park_id.trim() : "";
  if (!UUID_RE.test(parkId)) return bad("park_id must be a uuid");

  const category = typeof body.category === "string" ? body.category : "";
  if (!(category in REPORT_VALUES)) return bad(`category must be one of ${Object.keys(REPORT_VALUES).join(", ")}`);
  const allowed = REPORT_VALUES[category as ReportCategory] as readonly string[];
  const value = typeof body.value === "string" ? body.value : "";
  if (!allowed.includes(value)) return bad(`value for ${category} must be one of ${allowed.join(", ")}`);

  const deviceId = typeof body.device_id === "string" ? body.device_id.trim() : "";
  if (!UUID_RE.test(deviceId)) return bad("device_id must be a uuid");

  let note: string | null = null;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== "string") return bad("note must be a string");
    note = body.note.trim().slice(0, NOTE_MAX) || null;
  }

  let photoUrl: string | null = null;
  if (body.photo_url !== undefined && body.photo_url !== null && body.photo_url !== "") {
    if (typeof body.photo_url !== "string" || !photoUrlAllowed(body.photo_url)) {
      return bad("photo_url must point to the report-photos bucket");
    }
    photoUrl = body.photo_url;
  }

  const db = createAdminClient();
  const since = new Date(Date.now() - WINDOW_MIN * 60e3).toISOString();
  const { count, error: countErr } = await db
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("device_id", deviceId)
    .gte("created_at", since);
  if (countErr) return bad(countErr.message, 500);
  if ((count ?? 0) >= REPORT_LIMIT) return rateLimited();

  const { data, error } = await db
    .from("reports")
    .insert({
      park_id: parkId,
      category: category as ReportCategory,
      value: value as ReportValue,
      note,
      photo_url: photoUrl,
      device_id: deviceId,
      is_sample: false,
    })
    .select("*")
    .single();
  if (error) {
    if (/rate_limited/i.test(error.message)) return rateLimited();
    if (error.code === "23503") return bad("unknown park_id", 404);
    return bad(error.message, 400);
  }
  return Response.json({ ...data, ok: true, report: data }, { status: 201 });
}

async function handleConfirmation(body: Record<string, unknown>): Promise<Response> {
  const reportId = typeof body.report_id === "string" ? body.report_id.trim() : "";
  if (!UUID_RE.test(reportId)) return bad("report_id must be a uuid");
  const deviceId = typeof body.device_id === "string" ? body.device_id.trim() : "";
  if (!UUID_RE.test(deviceId)) return bad("device_id must be a uuid");
  const response = typeof body.response === "string" ? body.response : "";
  if (!(RESPONSES as readonly string[]).includes(response)) return bad(`response must be one of ${RESPONSES.join(", ")}`);

  const db = createAdminClient();
  const { data: report, error: repErr } = await db.from("reports").select("id").eq("id", reportId).maybeSingle();
  if (repErr) return bad(repErr.message, 500);
  if (!report) return bad("unknown report_id", 404);

  const since = new Date(Date.now() - WINDOW_MIN * 60e3).toISOString();
  const { count, error: countErr } = await db
    .from("report_confirmations")
    .select("id", { count: "exact", head: true })
    .eq("device_id", deviceId)
    .gte("created_at", since);
  if (countErr) return bad(countErr.message, 500);
  if ((count ?? 0) >= CONFIRM_LIMIT) return rateLimited();

  // one answer per device per report: update if it already exists
  const { data: existing, error: exErr } = await db
    .from("report_confirmations")
    .select("id")
    .eq("report_id", reportId)
    .eq("device_id", deviceId)
    .maybeSingle();
  if (exErr) return bad(exErr.message, 500);

  const result = existing
    ? await db
        .from("report_confirmations")
        .update({ response: response as (typeof RESPONSES)[number], created_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select("*")
        .single()
    : await db
        .from("report_confirmations")
        .insert({ report_id: reportId, device_id: deviceId, response: response as (typeof RESPONSES)[number] })
        .select("*")
        .single();
  if (result.error) return bad(result.error.message, 400);
  return Response.json({ ok: true, confirmation: result.data }, { status: 201 });
}
