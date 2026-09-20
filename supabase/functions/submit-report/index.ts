/**
 * LakeLens `submit-report` Edge Function.
 *
 * The browser calls this with the project's sb_publishable_ key in the `apikey`
 * header (supabase-js `functions.invoke` does that automatically). Publishable
 * keys are not JWTs, so `verify_jwt = false` is set in supabase/config.toml and
 * `withSupabase({ auth: "publishable" })` validates the key itself, handles
 * CORS + OPTIONS, and hands us:
 *   - ctx.supabase      anon client (RLS applies; anon has no INSERT grant)
 *   - ctx.supabaseAdmin service-role client (bypasses RLS): the ONLY write path
 *
 * Accepts two POST bodies:
 *   1) SubmitReportInput  { park_id, category, value, note?, photo_url?, device_id }
 *   2) ConfirmReportInput { type: "confirmation", report_id, device_id, response }
 *
 * Responses:
 *   201 { ...row }                          inserted (report or confirmation)
 *   200 { ...row }                          confirmation updated (same device re-answered)
 *   400 { error, issues? }                  validation / bad JSON / unknown park
 *   404 { error: "report_not_found" }       confirmation for a missing report
 *   405 { error: "method_not_allowed" }     non-POST
 *   429 { error: "rate_limited", retry_after_min, limit, window_min }
 *   500 { error }                           unexpected DB failure
 *
 * Rate limits (per device_id, sliding 10-minute window, counted via the admin client):
 *   reports 5 / 10 min · confirmations 20 / 10 min.
 * The DB trigger `enforce_report_rate_limit` is a backstop and is mapped to 429 too.
 */
import { withSupabase, type SupabaseContext } from "npm:@supabase/server@^1";
import { z } from "npm:zod@^4";

// ---------- enums (mirror lib/types.ts REPORT_VALUES; keep in sync by hand) ----------
const REPORT_VALUES = {
  entry: ["got_in", "turned_away", "line"],
  conditions: ["crowded", "water_high", "water_murky", "gator", "launch_closed"],
  parking: ["lot_full", "overflow_open"],
  accessibility: ["ramp_blocked", "wheelchair_available", "restroom_closed"],
} as const;

type ReportCategory = keyof typeof REPORT_VALUES;
const CATEGORIES = Object.keys(REPORT_VALUES) as [ReportCategory, ...ReportCategory[]];
const ALL_VALUES = Object.values(REPORT_VALUES).flat() as unknown as [string, ...string[]];

// ---------- limits ----------
const WINDOW_MIN = 10;
const REPORT_LIMIT = 5;
const CONFIRM_LIMIT = 20;
const NOTE_MAX = 280;
/** Confirmations are only meaningful for recent reports. */
const CONFIRM_MAX_AGE_H = 24;
const BUCKET = "report-photos";

// ---------- photo URL prefix ----------
// Hosted runtime injects SUPABASE_URL = https://<ref>.supabase.co. Locally it is http://kong:8000,
// which the browser never sees, so we also accept the local API URL and an explicit override.
function allowedPhotoPrefixes(): string[] {
  const prefixes = new Set<string>();
  const base = Deno.env.get("SUPABASE_URL")?.replace(/\/+$/, "");
  if (base) prefixes.add(`${base}/storage/v1/object/public/${BUCKET}/`);
  if (base?.includes("kong")) prefixes.add(`http://127.0.0.1:54321/storage/v1/object/public/${BUCKET}/`);
  const override = Deno.env.get("PHOTO_PUBLIC_URL_PREFIX");
  if (override) prefixes.add(override);
  return [...prefixes];
}

// ---------- schemas ----------
const NoteSchema = z
  .string()
  .trim()
  .max(NOTE_MAX, `Note must be ${NOTE_MAX} characters or fewer`)
  .transform((s) => (s.length === 0 ? null : s))
  .nullish()
  .transform((s) => s ?? null);

const PhotoUrlSchema = z
  .url()
  .nullish()
  .transform((u) => u ?? null)
  .refine(
    (u) => u === null || allowedPhotoPrefixes().some((p) => u.startsWith(p)),
    { message: `photo_url must be a public URL in the ${BUCKET} bucket of this project` },
  );

const ReportSchema = z
  .object({
    park_id: z.uuid(),
    category: z.enum(CATEGORIES),
    value: z.enum(ALL_VALUES),
    note: NoteSchema,
    photo_url: PhotoUrlSchema,
    device_id: z.uuid(),
  })
  .refine((b) => (REPORT_VALUES[b.category] as readonly string[]).includes(b.value), {
    path: ["value"],
    message: "value does not belong to this category",
  });

const ConfirmSchema = z.object({
  type: z.literal("confirmation"),
  report_id: z.uuid(),
  device_id: z.uuid(),
  response: z.enum(["still_true", "no_longer"]),
});

type ReportInput = z.infer<typeof ReportSchema>;
type ConfirmInput = z.infer<typeof ConfirmSchema>;

// ---------- helpers ----------
type Admin = SupabaseContext["supabaseAdmin"];

function json(body: unknown, status: number, headers?: Record<string, string>): Response {
  return Response.json(body, { status, headers });
}

function validationError(err: z.ZodError): Response {
  return json(
    {
      error: "invalid_payload",
      message: z.prettifyError(err),
      issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    },
    400,
  );
}

/**
 * Sliding-window rate limit per device_id. Returns null when allowed, or a 429
 * Response with `retry_after_min` = minutes until the oldest counted row leaves the window.
 */
async function rateLimit(
  admin: Admin,
  table: "reports" | "report_confirmations",
  deviceId: string,
  limit: number,
): Promise<Response | null> {
  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
  const { data, error, count } = await admin
    .from(table)
    .select("created_at", { count: "exact" })
    .eq("device_id", deviceId)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("rate limit query failed", table, error.message);
    return null; // fail open here; the DB trigger still backstops reports
  }
  if ((count ?? data?.length ?? 0) < limit) return null;
  const oldest = data?.[0]?.created_at ? new Date(data[0].created_at as string).getTime() : Date.now();
  const retryMs = Math.max(0, oldest + WINDOW_MIN * 60_000 - Date.now());
  const retryAfterMin = Math.max(1, Math.ceil(retryMs / 60_000));
  return json(
    { error: "rate_limited", retry_after_min: retryAfterMin, limit, window_min: WINDOW_MIN },
    429,
    { "Retry-After": String(retryAfterMin * 60) },
  );
}

async function handleReport(admin: Admin, input: ReportInput): Promise<Response> {
  const limited = await rateLimit(admin, "reports", input.device_id, REPORT_LIMIT);
  if (limited) return limited;

  const { data, error } = await admin
    .from("reports")
    .insert({
      park_id: input.park_id,
      category: input.category,
      value: input.value,
      note: input.note,
      photo_url: input.photo_url,
      device_id: input.device_id,
      is_sample: false, // never trust the client for this
    })
    .select()
    .single();

  if (error) {
    // Backstop trigger enforce_report_rate_limit raises P0001 'rate_limited: ...'
    if (error.code === "P0001" || /rate_limited/i.test(error.message)) {
      return json(
        { error: "rate_limited", retry_after_min: WINDOW_MIN, limit: REPORT_LIMIT, window_min: WINDOW_MIN },
        429,
        { "Retry-After": String(WINDOW_MIN * 60) },
      );
    }
    if (error.code === "23503") return json({ error: "unknown_park", message: "No park with that id" }, 400);
    if (error.code === "23514") return json({ error: "invalid_payload", message: error.message }, 400);
    console.error("report insert failed", error);
    return json({ error: "insert_failed", message: error.message }, 500);
  }
  return json(data, 201);
}

async function handleConfirmation(admin: Admin, input: ConfirmInput): Promise<Response> {
  const limited = await rateLimit(admin, "report_confirmations", input.device_id, CONFIRM_LIMIT);
  if (limited) return limited;

  const { data: report, error: reportErr } = await admin
    .from("reports")
    .select("id, created_at")
    .eq("id", input.report_id)
    .maybeSingle();
  if (reportErr) {
    console.error("report lookup failed", reportErr);
    return json({ error: "lookup_failed", message: reportErr.message }, 500);
  }
  if (!report) return json({ error: "report_not_found" }, 404);
  const ageMs = Date.now() - new Date(report.created_at as string).getTime();
  if (ageMs > CONFIRM_MAX_AGE_H * 3_600_000) {
    return json({ error: "report_expired", message: `Reports older than ${CONFIRM_MAX_AGE_H} h cannot be confirmed` }, 400);
  }

  // One live answer per (report, device): re-answering updates it instead of stacking rows.
  const { data: existing } = await admin
    .from("report_confirmations")
    .select("id")
    .eq("report_id", input.report_id)
    .eq("device_id", input.device_id)
    .maybeSingle();

  if (existing?.id) {
    const { data, error } = await admin
      .from("report_confirmations")
      .update({ response: input.response, created_at: new Date().toISOString() })
      .eq("id", existing.id as string)
      .select()
      .single();
    if (error) {
      console.error("confirmation update failed", error);
      return json({ error: "update_failed", message: error.message }, 500);
    }
    return json(data, 200);
  }

  const { data, error } = await admin
    .from("report_confirmations")
    .insert({ report_id: input.report_id, device_id: input.device_id, response: input.response })
    .select()
    .single();
  if (error) {
    if (error.code === "23503") return json({ error: "report_not_found" }, 404);
    if (error.code === "23514") return json({ error: "invalid_payload", message: error.message }, 400);
    console.error("confirmation insert failed", error);
    return json({ error: "insert_failed", message: error.message }, 500);
  }
  return json(data, 201);
}

// ---------- entrypoint ----------
const handler = {
  fetch: withSupabase({ auth: "publishable" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, { Allow: "POST, OPTIONS" });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_json", message: "Body must be JSON" }, 400);
    }
    if (typeof body !== "object" || body === null) {
      return json({ error: "invalid_payload", message: "Body must be a JSON object" }, 400);
    }

    const isConfirmation = (body as { type?: unknown }).type === "confirmation";
    const parsed = isConfirmation ? ConfirmSchema.safeParse(body) : ReportSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    try {
      return isConfirmation
        ? await handleConfirmation(ctx.supabaseAdmin, parsed.data as ConfirmInput)
        : await handleReport(ctx.supabaseAdmin, parsed.data as ReportInput);
    } catch (err) {
      console.error("submit-report unhandled", err);
      return json({ error: "internal_error" }, 500);
    }
  }),
};

export default handler;
