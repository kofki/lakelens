-- =============================================================================
-- LakeLens migration 0: extensions
-- Idempotent: safe to re-run. Applied via Supabase MCP `apply_migration`
-- (name "extensions") or `supabase db push`: never both (see README.md).
-- =============================================================================

-- pg_cron: the scheduler. Supabase requires it in pg_catalog.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- pg_net: async HTTP from Postgres (creates schema `net`). Used by cron jobs to
-- call the Next.js /api/cron/* route handlers.
create extension if not exists pg_net with schema extensions;

-- Vault: holds `app_url` and `cron_secret`. Pre-installed on hosted projects, so
-- this is normally a no-op. The two secrets themselves are inserted ONCE by hand
-- (see supabase/migrations/README.md): never in a migration file.
create extension if not exists supabase_vault;

-- gen_random_uuid() is core Postgres (>= 13); no pgcrypto needed.
