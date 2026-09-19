/**
 * Server-only ADMIN client (secret key => service_role, bypasses RLS).
 * Only route handlers and lib/ingest/run.ts may import this. Never expose to the browser.
 */
import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Supabase admin client: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set");
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
