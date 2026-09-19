/**
 * Browser client for crowd reports (submit / confirm / photo upload).
 *
 * Write path: the Supabase Edge Function `submit-report` via `supabase.functions.invoke`
 * (sends the publishable key in the `apikey` header). When NEXT_PUBLIC_REPORTS_VIA=api the
 * same JSON bodies are POSTed to the Next.js route `/api/reports` instead.
 *
 * Every function here resolves — never throws — so UI code can branch on `ok`.
 * Error strings are plain language, ready to show to a person.
 */
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { ConfirmReportInput, Report, SubmitReportInput } from "@/lib/types";

export type SubmitReportResult = { ok: true; report: Report } | { ok: false; error: string; status: number };
export type ConfirmReportResult = { ok: boolean; error?: string };

export const REPORT_PHOTO_BUCKET = "report-photos";
/** Longest edge after client-side downscale (keeps uploads small on mobile). */
export const PHOTO_MAX_EDGE_PX = 1600;
const PHOTO_JPEG_QUALITY = 0.85;
/** Bucket limit set in the storage migration (5 MiB). */
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const FUNCTION_NAME = "submit-report";
const API_ROUTE = "/api/reports";

/** Body of an error response from the Edge Function or the /api/reports fallback. */
interface ErrorBody {
  error?: string;
  message?: string;
  retry_after_min?: number;
  issues?: { path?: string; message?: string }[];
}

function viaApiRoute(): boolean {
  return process.env.NEXT_PUBLIC_REPORTS_VIA === "api";
}

/** Turn a status + error body into one plain-language sentence. */
export function describeReportError(status: number, body: ErrorBody | null): string {
  const code = body?.error;
  if (status === 429) {
    const mins = body?.retry_after_min ?? 10;
    return `You've sent a few reports already — try again in about ${mins} minute${mins === 1 ? "" : "s"}.`;
  }
  if (status === 0) return "No connection. Check your signal and try again.";
  if (status === 401 || status === 403) return "This app isn't allowed to send reports right now. Try again later.";
  if (status === 404 || code === "report_not_found") return "That report is no longer available.";
  if (code === "report_expired") return "That report is too old to confirm.";
  if (code === "unknown_park") return "We couldn't find that park. Refresh and try again.";
  if (status === 400) {
    const first = body?.issues?.[0]?.message ?? body?.message;
    return first ? `That report didn't look right: ${first}` : "That report didn't look right. Check it and try again.";
  }
  if (status >= 500) return "Something went wrong on our side. Please try again in a moment.";
  return body?.message ?? body?.error ?? `Couldn't send the report (status ${status}).`;
}

async function readErrorBody(res: Response | undefined | null): Promise<ErrorBody | null> {
  if (!res) return null;
  try {
    const text = await res.clone().text();
    if (!text) return null;
    try {
      return JSON.parse(text) as ErrorBody;
    } catch {
      return { message: text.slice(0, 200) };
    }
  } catch {
    return null;
  }
}

type Transport = { ok: true; status: number; data: unknown } | { ok: false; status: number; error: string };

/** POST a JSON body through the Edge Function (default) or the /api/reports fallback. */
async function post(body: Record<string, unknown>): Promise<Transport> {
  if (viaApiRoute()) return postApiRoute(body);
  return postFunction(body);
}

async function postFunction(body: Record<string, unknown>): Promise<Transport> {
  let supabase: ReturnType<typeof createClient>;
  try {
    supabase = createClient();
  } catch {
    return { ok: false, status: 0, error: "Reporting isn't configured on this build." };
  }

  const { data, error, response } = await supabase.functions.invoke(FUNCTION_NAME, { body });
  if (!error) return { ok: true, status: response?.status ?? 200, data };

  if (error instanceof FunctionsHttpError) {
    const res = (error.context as Response | undefined) ?? response;
    const status = res?.status ?? 500;
    const errBody = await readErrorBody(res);
    return { ok: false, status, error: describeReportError(status, errBody) };
  }
  if (error instanceof FunctionsRelayError) {
    return { ok: false, status: 502, error: describeReportError(502, null) };
  }
  if (error instanceof FunctionsFetchError) {
    return { ok: false, status: 0, error: describeReportError(0, null) };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, status: 500, error: describeReportError(500, { message }) };
}

async function postApiRoute(body: Record<string, unknown>): Promise<Transport> {
  let res: Response;
  try {
    res = await fetch(API_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, error: describeReportError(0, null) };
  }
  if (!res.ok) {
    const errBody = await readErrorBody(res);
    return { ok: false, status: res.status, error: describeReportError(res.status, errBody) };
  }
  try {
    return { ok: true, status: res.status, data: await res.json() };
  } catch {
    return { ok: false, status: res.status, error: describeReportError(500, { message: "Empty response" }) };
  }
}

function isReportRow(data: unknown): data is Report {
  if (typeof data !== "object" || data === null) return false;
  const r = data as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.park_id === "string" && typeof r.category === "string";
}

function cleanNote(note: string | null | undefined): string | null {
  if (typeof note !== "string") return null;
  const trimmed = note.trim().slice(0, 280);
  return trimmed.length ? trimmed : null;
}

/**
 * Submit a one-tap crowd report. Resolves to the inserted row on success, or a
 * plain-language `error` + HTTP `status` (429 = rate-limited, 0 = offline).
 */
export async function submitReport(input: SubmitReportInput): Promise<SubmitReportResult> {
  const body = {
    park_id: input.park_id,
    category: input.category,
    value: input.value,
    note: cleanNote(input.note),
    photo_url: input.photo_url ? input.photo_url : null,
    device_id: input.device_id,
  };
  const result = await post(body);
  if (!result.ok) return { ok: false, error: result.error, status: result.status };
  if (!isReportRow(result.data)) {
    return { ok: false, error: describeReportError(500, { message: "Unexpected response" }), status: result.status };
  }
  return { ok: true, report: result.data };
}

/** Answer a "Still true?" prompt on an existing report. */
export async function confirmReport(input: ConfirmReportInput): Promise<ConfirmReportResult> {
  const body = {
    type: "confirmation" as const,
    report_id: input.report_id,
    device_id: input.device_id,
    response: input.response,
  };
  const result = await post(body);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

// ---------- photo upload ----------

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image could not be decoded"));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Downscale an image so its longest edge is <= maxEdge px and re-encode as JPEG.
 * Browser only. Returns null if the image cannot be decoded (e.g. HEIC on non-Safari).
 */
export async function downscaleImage(file: File, maxEdge: number = PHOTO_MAX_EDGE_PX): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  try {
    let width: number;
    let height: number;
    let source: CanvasImageSource;

    if (typeof createImageBitmap === "function") {
      // EXIF orientation is honoured by default in modern browsers.
      const bitmap = await createImageBitmap(file);
      width = bitmap.width;
      height = bitmap.height;
      source = bitmap;
    } else {
      const img = await loadImage(file);
      width = img.naturalWidth;
      height = img.naturalHeight;
      source = img;
    }
    if (!width || !height) return null;

    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, targetW, targetH);
    if ("close" in source && typeof (source as ImageBitmap).close === "function") (source as ImageBitmap).close();

    return await canvasToBlob(canvas, "image/jpeg", PHOTO_JPEG_QUALITY);
  } catch {
    return null;
  }
}

function newUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * Downscale to <= 1600 px, upload to the public `report-photos` bucket at
 * `reports/<deviceId>/<uuid>.jpg`, and return the public URL (what the Edge Function
 * accepts as `photo_url`). Returns null on any failure so the report can still be sent without a photo.
 */
export async function uploadReportPhoto(file: File, deviceId: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (!file || !file.type.startsWith("image/")) return null;

  let blob: Blob | null = await downscaleImage(file);
  let ext = "jpg";
  let contentType = "image/jpeg";

  if (!blob) {
    // Could not decode (e.g. HEIC outside Safari): send the original if the bucket allows it.
    const allowed: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/heic": "heic",
    };
    const originalExt = allowed[file.type];
    if (!originalExt || file.size > PHOTO_MAX_BYTES) return null;
    blob = file;
    ext = originalExt;
    contentType = file.type;
  }
  if (blob.size > PHOTO_MAX_BYTES) return null;

  try {
    const supabase = createClient();
    const path = `reports/${deviceId}/${newUuid()}.${ext}`;
    const { error } = await supabase.storage
      .from(REPORT_PHOTO_BUCKET)
      .upload(path, blob, { contentType, upsert: false, cacheControl: "31536000" });
    if (error) return null;
    const { data } = supabase.storage.from(REPORT_PHOTO_BUCKET).getPublicUrl(path);
    return data?.publicUrl ?? null;
  } catch {
    return null;
  }
}
