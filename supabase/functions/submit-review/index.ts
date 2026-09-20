/**
 * LakeLens `submit-review` Edge Function.
 *
 * Same shape as submit-report: the browser calls it with the project's sb_publishable_
 * key, `withSupabase({ auth: "publishable" })` validates that key, handles CORS, and hands
 * us a service-role client that is the only write path. The anon role has no insert grant
 * on public.reviews, so nothing can be written around this.
 *
 * POST { park_id, rating, body?, photo_urls?, visited_on?, device_id }
 *
 *   201 { ...row }                      first review from this device for this park
 *   200 { ...row }                      the same device revising its review
 *   400 { error, issues? }              validation, bad JSON, unknown park
 *   405 { error: "method_not_allowed" }
 *   429 { error: "rate_limited", ... }
 *   500 { error }
 *
 * A device gets one review per park, enforced by a unique index rather than by this
 * function alone, so two concurrent submissions cannot both insert. Re-submitting
 * updates, which is what "edit my review" means.
 */
import { withSupabase, type SupabaseContext } from "npm:@supabase/server@^1";
import { z } from "npm:zod@^4";

const WINDOW_MIN = 60;
/** Reviews are considered, not reflexive: a lower ceiling than reports over a longer window. */
const REVIEW_LIMIT = 10;
const BODY_MAX = 1000;
const MAX_PHOTOS = 4;
const BUCKET = "report-photos";

function allowedPhotoPrefixes(): string[] {
  const prefixes = new Set<string>();
  const base = Deno.env.get("SUPABASE_URL")?.replace(/\/+$/, "");
  if (base) prefixes.add(`${base}/storage/v1/object/public/${BUCKET}/`);
  if (base?.includes("kong")) prefixes.add(`http://127.0.0.1:54321/storage/v1/object/public/${BUCKET}/`);
  const override = Deno.env.get("PHOTO_PUBLIC_URL_PREFIX");
  if (override) prefixes.add(override);
  return [...prefixes];
}

const BodySchema = z
  .string()
  .trim()
  .max(BODY_MAX, `Review must be ${BODY_MAX} characters or fewer`)
  .transform((s) => (s.length === 0 ? null : s))
  .nullish()
  .transform((s) => s ?? null);

const PhotoUrlsSchema = z
  .array(z.url())
  .max(MAX_PHOTOS, `At most ${MAX_PHOTOS} photos`)
  .nullish()
  .transform((u) => u ?? [])
  .refine((urls) => urls.every((u) => allowedPhotoPrefixes().some((p) => u.startsWith(p))), {
    message: `photos must be public URLs in the ${BUCKET} bucket of this project`,
  });

const ReviewSchema = z.object({
  park_id: z.uuid(),
  rating: z.number().int().min(1).max(5),
  body: BodySchema,
  photo_urls: PhotoUrlsSchema,
  // A visit cannot be in the future; the column has the same check.
  visited_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish()
    .transform((d) => d ?? null),
  device_id: z.uuid(),
});

type ReviewInput = z.infer<typeof ReviewSchema>;
type Admin = SupabaseContext["supabaseAdmin"];

function json(body: unknown, status: number, headers?: Record<string, string>): Response {
  return Response.json(body, { status, headers });
}

/** Sliding-window rate limit per device. Fails open: the unique index is the real guard. */
async function rateLimit(admin: Admin, deviceId: string): Promise<Response | null> {
  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
  const { data, error, count } = await admin
    .from("reviews")
    .select("created_at", { count: "exact" })
    .eq("device_id", deviceId)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(REVIEW_LIMIT);
  if (error) {
    console.error("review rate limit query failed", error.message);
    return null;
  }
  if ((count ?? data?.length ?? 0) < REVIEW_LIMIT) return null;
  const oldest = data?.[0]?.created_at ? new Date(data[0].created_at as string).getTime() : Date.now();
  const retryAfterMin = Math.max(1, Math.ceil(Math.max(0, oldest + WINDOW_MIN * 60_000 - Date.now()) / 60_000));
  return json({ error: "rate_limited", retry_after_min: retryAfterMin, limit: REVIEW_LIMIT, window_min: WINDOW_MIN }, 429, {
    "Retry-After": String(retryAfterMin * 60),
  });
}

async function handleReview(admin: Admin, input: ReviewInput): Promise<Response> {
  const { data: existing, error: lookupErr } = await admin
    .from("reviews")
    .select("id")
    .eq("park_id", input.park_id)
    .eq("device_id", input.device_id)
    .maybeSingle();
  if (lookupErr) {
    console.error("review lookup failed", lookupErr);
    return json({ error: "lookup_failed", message: lookupErr.message }, 500);
  }

  // Only a NEW review counts against the limit: editing your own should always work.
  if (!existing) {
    const limited = await rateLimit(admin, input.device_id);
    if (limited) return limited;
  }

  const row = {
    park_id: input.park_id,
    rating: input.rating,
    body: input.body,
    photo_urls: input.photo_urls,
    visited_on: input.visited_on,
    device_id: input.device_id,
    is_sample: false, // never trust the client for this
  };

  const { data, error } = existing
    ? await admin.from("reviews").update(row).eq("id", existing.id).select().single()
    : await admin.from("reviews").insert(row).select().single();

  if (error) {
    if (error.code === "23503") return json({ error: "unknown_park", message: "No park with that id" }, 400);
    if (error.code === "23514") return json({ error: "invalid_payload", message: error.message }, 400);
    // Lost the race against another submission from the same device: treat as an edit.
    if (error.code === "23505") {
      const { data: retry, error: retryErr } = await admin
        .from("reviews")
        .update(row)
        .eq("park_id", input.park_id)
        .eq("device_id", input.device_id)
        .select()
        .single();
      if (!retryErr) return json(retry, 200);
    }
    console.error("review write failed", error);
    return json({ error: "insert_failed", message: error.message }, 500);
  }
  return json(data, existing ? 200 : 201);
}

const handler = {
  fetch: withSupabase({ auth: "publishable" }, async (req: Request, ctx: SupabaseContext): Promise<Response> => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const raw = await req.json().catch(() => null);
    if (raw === null) return json({ error: "invalid_payload", message: "Body must be JSON" }, 400);

    const parsed = ReviewSchema.safeParse(raw);
    if (!parsed.success) {
      return json(
        {
          error: "invalid_payload",
          message: z.prettifyError(parsed.error),
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        400,
      );
    }
    return handleReview(ctx.supabaseAdmin as Admin, parsed.data);
  }),
};

export default handler;
