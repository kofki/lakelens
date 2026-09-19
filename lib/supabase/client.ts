/**
 * Browser Supabase client (publishable key). Safe to import from "use client" components.
 * Uses @supabase/ssr so cookies/auth would work later; today there is no user auth.
 */
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
