"use client";

/**
 * The reader's anonymous session.
 *
 * Every visitor gets a durable identity without meeting a signup form, which is the only
 * way a one-tap "the lot is full" stays a one-tap report. The same person on a phone and a
 * laptop is still two people until they link an email; that is a real limit and a much
 * smaller one than a device id, which a cleared cache turns into a stranger.
 *
 * Everything here fails soft. If anonymous sign-in is disabled on the project, or the
 * network is down, the caller gets null and the report goes out with a device id exactly
 * as it did before. Identity is an improvement to a report, never a condition of one.
 */
import { createClient } from "./client";

let pending: Promise<string | null> | null = null;

async function start(): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    if (data.session?.user?.id) return data.session.user.id;

    const { data: created, error } = await supabase.auth.signInAnonymously();
    if (error) {
      // Most likely the provider is off. Worth knowing in a console, not worth a dialog.
      console.warn("[lakelens/auth] anonymous sign-in unavailable:", error.message);
      return null;
    }
    return created.user?.id ?? null;
  } catch (err) {
    console.warn("[lakelens/auth] anonymous sign-in failed:", err);
    return null;
  }
}

/**
 * The current user id, signing in anonymously if there is no session yet.
 *
 * Concurrent callers share one attempt: a park page can easily ask twice in the same tick,
 * and two sign-ins would mean two users for one person.
 */
export function getUserId(): Promise<string | null> {
  pending ??= start();
  return pending;
}

/**
 * Attach an email to the anonymous session, keeping everything already reported under it.
 *
 * This is the whole upgrade path. Nothing in the app requires it, and until someone asks
 * for it their reports are theirs on this device and nowhere else.
 */
export async function linkEmail(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ email });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not send the confirmation email" };
  }
}
