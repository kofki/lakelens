/**
 * Server-side PUBLIC client (publishable key, no cookies).
 *
 * Used by Server Components and lib/queries.ts so pages stay cacheable
 * (`export const revalidate = 60`). Never reads `cookies()`; RLS applies (public read only).
 * For writes use lib/supabase/admin.ts (server-only secret key).
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export function createPublicClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
