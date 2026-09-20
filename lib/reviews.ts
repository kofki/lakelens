/**
 * Browser client for reviews.
 *
 * Write path is the `submit-review` Edge Function via `supabase.functions.invoke`, which
 * sends the publishable key in the `apikey` header. The anon role has no insert grant on
 * public.reviews, so this is the only way in.
 *
 * Like lib/reports.ts, nothing here throws: callers branch on `ok` and show `error`.
 */
import { FunctionsHttpError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { uploadPhoto } from "@/lib/reports";
import type { Review, SubmitReviewInput } from "@/lib/types";

export type SubmitReviewResult = { ok: true; review: Review } | { ok: false; error: string; status: number };

const FUNCTION_NAME = "submit-review";

interface ErrorBody {
  error?: string;
  message?: string;
  retry_after_min?: number;
  issues?: { path?: string; message?: string }[];
}

/** One plain-language sentence for a failed submission. */
export function describeReviewError(status: number, body: ErrorBody | null): string {
  const code = body?.error;
  if (status === 429) {
    const mins = body?.retry_after_min ?? 60;
    return `You've left a few reviews already. Try again in about ${mins} minute${mins === 1 ? "" : "s"}.`;
  }
  if (status === 0) return "No connection. Check your signal and try again.";
  if (status === 401 || status === 403) return "This app isn't allowed to send reviews right now. Try again later.";
  if (code === "unknown_park") return "We couldn't find that park. Refresh and try again.";
  if (status === 400) {
    const first = body?.issues?.[0]?.message ?? body?.message;
    return first ? `That review didn't look right: ${first}` : "That review didn't look right. Check it and try again.";
  }
  if (status >= 500) return "Something went wrong on our side. Please try again in a moment.";
  return body?.message ?? body?.error ?? `Couldn't send the review (status ${status}).`;
}

async function readErrorBody(res: Response | undefined | null): Promise<ErrorBody | null> {
  if (!res) return null;
  try {
    return (await res.json()) as ErrorBody;
  } catch {
    return null;
  }
}

export async function submitReview(input: SubmitReviewInput): Promise<SubmitReviewResult> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke<Review>(FUNCTION_NAME, { body: input });
    if (error) {
      const res = error instanceof FunctionsHttpError ? error.context : null;
      const status = res?.status ?? 0;
      return { ok: false, error: describeReviewError(status, await readErrorBody(res)), status };
    }
    if (!data) return { ok: false, error: "The review didn't come back from the server. Try again.", status: 0 };
    return { ok: true, review: data };
  } catch {
    return { ok: false, error: "No connection. Check your signal and try again.", status: 0 };
  }
}

/** Upload one review photo; returns its public URL, or null when it could not be stored. */
export async function uploadReviewPhoto(file: File, deviceId: string): Promise<string | null> {
  return uploadPhoto(file, deviceId, "reviews");
}
