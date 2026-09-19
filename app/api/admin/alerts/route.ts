/**
 * /api/admin/alerts — manual official alerts (closures / notices). Bearer ADMIN_TOKEN required.
 *
 *   GET    ?park_id=&kind=&active=true|false           list (newest last_seen first, max 200)
 *   POST   { park_id | park_slug, kind, text, official_url?, severity?, starts_at?, ends_at?, active? }
 *          upserts by hash = sha256(park_id|kind|text) -> 201 with the row
 *   PATCH  { id, active?, ends_at?, text?, official_url?, severity?, starts_at? } -> 200 with the row
 *
 * Closures are data, not code: setting active=false (or an ends_at in the past) on a kind=closure
 * row re-opens the park on the next request because status is derived at read time.
 */
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { manualAlertHash } from "@/lib/ingest/hash";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KINDS = ["closure", "notice", "nws"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEXT_MAX = 1000;

type AlertInsert = Database["public"]["Tables"]["park_alerts"]["Insert"];
type AlertUpdate = Database["public"]["Tables"]["park_alerts"]["Update"];

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function unauthorized(req: NextRequest): Response | null {
  const token = process.env.ADMIN_TOKEN;
  const header = req.headers.get("authorization") ?? "";
  if (!token || !safeEqual(header, `Bearer ${token}`)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return null;
}

const bad = (error: string, status = 400) => Response.json({ ok: false, error }, { status });

/** Accepts ISO-ish timestamps or null; returns ISO UTC, null, or undefined (= not provided). */
function parseTimestamp(v: unknown, field: string): { value: string | null | undefined; error?: string } {
  if (v === undefined) return { value: undefined };
  if (v === null || v === "") return { value: null };
  if (typeof v !== "string" || Number.isNaN(Date.parse(v))) return { value: undefined, error: `${field} must be an ISO timestamp or null` };
  return { value: new Date(v).toISOString() };
}

function optionalString(v: unknown, field: string, max = 2000): { value: string | null | undefined; error?: string } {
  if (v === undefined) return { value: undefined };
  if (v === null || v === "") return { value: null };
  if (typeof v !== "string") return { value: undefined, error: `${field} must be a string` };
  const s = v.trim();
  if (s.length > max) return { value: undefined, error: `${field} must be at most ${max} characters` };
  return { value: s };
}

export async function GET(req: NextRequest): Promise<Response> {
  const denied = unauthorized(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const db = createAdminClient();
  let q = db.from("park_alerts").select("*").order("last_seen", { ascending: false }).limit(200);
  const parkId = url.searchParams.get("park_id");
  const kind = url.searchParams.get("kind");
  const active = url.searchParams.get("active");
  if (parkId) q = q.eq("park_id", parkId);
  if (kind) q = q.eq("kind", kind);
  if (active === "true" || active === "false") q = q.eq("active", active === "true");
  const { data, error } = await q;
  if (error) return bad(error.message, 500);
  return Response.json({ ok: true, alerts: data ?? [] });
}

export async function POST(req: NextRequest): Promise<Response> {
  const denied = unauthorized(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return bad("body must be JSON");

  const db = createAdminClient();

  // park: by id or slug
  let parkId = typeof body.park_id === "string" ? body.park_id.trim() : "";
  if (!parkId && typeof body.park_slug === "string" && body.park_slug.trim()) {
    const { data, error } = await db.from("parks").select("id").eq("slug", body.park_slug.trim()).maybeSingle();
    if (error) return bad(error.message, 500);
    if (!data) return bad(`no park with slug "${body.park_slug}"`, 404);
    parkId = data.id;
  }
  if (!UUID_RE.test(parkId)) return bad("park_id (uuid) or park_slug is required");

  const kind = typeof body.kind === "string" ? body.kind : "";
  if (!(KINDS as readonly string[]).includes(kind)) return bad(`kind must be one of ${KINDS.join(", ")}`);

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return bad("text is required");
  if (text.length > TEXT_MAX) return bad(`text must be at most ${TEXT_MAX} characters`);

  const officialUrl = optionalString(body.official_url, "official_url");
  if (officialUrl.error) return bad(officialUrl.error);
  if (officialUrl.value && !/^https?:\/\//i.test(officialUrl.value)) return bad("official_url must start with http(s)://");
  const severity = optionalString(body.severity, "severity", 40);
  if (severity.error) return bad(severity.error);
  const startsAt = parseTimestamp(body.starts_at, "starts_at");
  if (startsAt.error) return bad(startsAt.error);
  const endsAt = parseTimestamp(body.ends_at, "ends_at");
  if (endsAt.error) return bad(endsAt.error);
  const source = optionalString(body.source, "source", 40);
  if (source.error) return bad(source.error);
  const active = body.active === undefined ? true : body.active === true;

  const nowIso = new Date().toISOString();
  const row: AlertInsert = {
    park_id: parkId,
    kind,
    text,
    source: source.value ?? "manual",
    official_url: officialUrl.value ?? null,
    severity: severity.value ?? null,
    starts_at: startsAt.value ?? null,
    ends_at: endsAt.value ?? null,
    hash: manualAlertHash(parkId, kind, text),
    active,
    last_seen: nowIso,
    last_checked_at: nowIso,
  };
  const { data, error } = await db.from("park_alerts").upsert(row, { onConflict: "hash" }).select("*").single();
  if (error) return bad(error.message, error.code === "23503" ? 404 : 500);
  return Response.json({ ok: true, alert: data }, { status: 201 });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const denied = unauthorized(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return bad("body must be JSON");
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!UUID_RE.test(id)) return bad("id (uuid) is required");

  const update: AlertUpdate = { last_checked_at: new Date().toISOString() };
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") return bad("active must be a boolean");
    update.active = body.active;
  }
  const endsAt = parseTimestamp(body.ends_at, "ends_at");
  if (endsAt.error) return bad(endsAt.error);
  if (endsAt.value !== undefined) update.ends_at = endsAt.value;
  const startsAt = parseTimestamp(body.starts_at, "starts_at");
  if (startsAt.error) return bad(startsAt.error);
  if (startsAt.value !== undefined) update.starts_at = startsAt.value;
  const text = optionalString(body.text, "text", TEXT_MAX);
  if (text.error) return bad(text.error);
  if (text.value !== undefined) {
    if (!text.value) return bad("text cannot be empty");
    update.text = text.value;
  }
  const officialUrl = optionalString(body.official_url, "official_url");
  if (officialUrl.error) return bad(officialUrl.error);
  if (officialUrl.value !== undefined) update.official_url = officialUrl.value;
  const severity = optionalString(body.severity, "severity", 40);
  if (severity.error) return bad(severity.error);
  if (severity.value !== undefined) update.severity = severity.value;

  const db = createAdminClient();
  const { data, error } = await db.from("park_alerts").update(update).eq("id", id).select("*").maybeSingle();
  if (error) return bad(error.message, 500);
  if (!data) return bad(`no alert with id ${id}`, 404);
  return Response.json({ ok: true, alert: data });
}
