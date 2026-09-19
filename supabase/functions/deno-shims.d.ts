/**
 * Ambient shims so the Deno Edge Functions under supabase/functions/** type-check under the
 * root Next.js tsconfig (which includes every *.ts in the repo). They are NOT deployed and do
 * not affect the Deno runtime; the function is checked for real against the published
 * @supabase/server + zod types before deploy (see supabase/functions/README.md).
 *
 * If INFRA adds "supabase/functions" to tsconfig `exclude`, this file becomes inert.
 */

declare const Deno: {
  env: { get(name: string): string | undefined };
};

declare module "npm:zod@^4" {
  export * from "zod";
}

declare module "npm:@supabase/server@^1" {
  import type { SupabaseClient } from "@supabase/supabase-js";

  export type AuthMode = "user" | "publishable" | "secret" | "none" | `publishable:${string}` | `secret:${string}`;

  /** Mirrors the package's UntypedDatabase default: rows are `any` unless a Database generic is given. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type UntypedDatabase = any;

  export interface SupabaseContext<Database = UntypedDatabase> {
    /** RLS-scoped client (anon for auth: "publishable"). */
    supabase: SupabaseClient<Database>;
    /** Service-role client; bypasses RLS. */
    supabaseAdmin: SupabaseClient<Database>;
    userClaims: { id: string; email?: string; role?: string } | null;
    jwtClaims: Record<string, unknown> | null;
    authMode: AuthMode;
    authKeyName?: string;
  }

  export interface WithSupabaseConfig {
    auth?: AuthMode | AuthMode[];
    cors?: "default" | "disabled" | { headers: Record<string, string> };
    env?: { url?: string; publishableKey?: string; secretKey?: string };
  }

  export function withSupabase<Database = UntypedDatabase>(
    config: WithSupabaseConfig,
    handler: (req: Request, ctx: SupabaseContext<Database>) => Promise<Response>,
  ): (req: Request) => Promise<Response>;
}
