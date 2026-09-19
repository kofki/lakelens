-- =============================================================================
-- LakeLens migration 2 — grants + row level security
-- Design A (primary): the browser (anon, publishable key) can only SELECT.
-- All writes go through the submit-report Edge Function / Next.js route
-- handlers using the secret key (service_role bypasses RLS). Design B (direct
-- anon INSERT) is kept commented at the bottom as a fallback.
-- Idempotent: grants are additive; drop policy if exists before create policy.
-- =============================================================================

-- Supabase no longer auto-grants table privileges on new projects: be explicit.
grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to anon, authenticated;              -- includes views
grant select, insert, update, delete on all tables in schema public to service_role;
revoke insert, update, delete on all tables in schema public from anon, authenticated;  -- no-op if never granted

-- Tables created by later migrations (as postgres) inherit the same shape.
alter default privileges for role postgres in schema public
  grant select on tables to anon, authenticated;
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;

-- RLS on every table (views inherit via security_invoker).
alter table public.parks                enable row level security;
alter table public.accessibility        enable row level security;
alter table public.parking_lots         enable row level security;
alter table public.conditions_snapshots enable row level security;
alter table public.park_alerts          enable row level security;
alter table public.reports              enable row level security;
alter table public.report_confirmations enable row level security;
alter table public.holidays             enable row level security;
alter table public.long_weekends        enable row level security;

-- Public read on everything. Always name roles with `to`.
drop policy if exists "public read parks" on public.parks;
create policy "public read parks"
  on public.parks for select to anon, authenticated using (true);

drop policy if exists "public read accessibility" on public.accessibility;
create policy "public read accessibility"
  on public.accessibility for select to anon, authenticated using (true);

drop policy if exists "public read parking" on public.parking_lots;
create policy "public read parking"
  on public.parking_lots for select to anon, authenticated using (true);

drop policy if exists "public read conditions" on public.conditions_snapshots;
create policy "public read conditions"
  on public.conditions_snapshots for select to anon, authenticated using (true);

drop policy if exists "public read alerts" on public.park_alerts;
create policy "public read alerts"
  on public.park_alerts for select to anon, authenticated using (true);

drop policy if exists "public read reports" on public.reports;
create policy "public read reports"
  on public.reports for select to anon, authenticated using (true);

drop policy if exists "public read confirmations" on public.report_confirmations;
create policy "public read confirmations"
  on public.report_confirmations for select to anon, authenticated using (true);

drop policy if exists "public read holidays" on public.holidays;
create policy "public read holidays"
  on public.holidays for select to anon, authenticated using (true);

drop policy if exists "public read long weekends" on public.long_weekends;
create policy "public read long weekends"
  on public.long_weekends for select to anon, authenticated using (true);

-- DESIGN A: deliberately NO insert/update/delete policies for anon/authenticated.
-- service_role has bypassrls, so the Edge Function's admin client can insert;
-- the browser cannot. Nothing else to add.

-- =============================================================================
-- DESIGN B (fallback, disabled): direct anon INSERT constrained by column-level
-- grants + CHECK constraints (schema migration) + the rate-limit trigger.
-- Enable only if the Edge Function cannot be deployed. Replace <PROJECT_REF>.
-- =============================================================================
-- grant insert (park_id, category, value, note, photo_url, device_id) on public.reports to anon;
-- grant insert (report_id, device_id, response) on public.report_confirmations to anon;
-- drop policy if exists "anon insert reports" on public.reports;
-- create policy "anon insert reports" on public.reports for insert to anon
--   with check (
--     device_id is not null
--     and char_length(coalesce(note, '')) <= 280
--     and (photo_url is null
--          or photo_url like 'https://<PROJECT_REF>.supabase.co/storage/v1/object/public/report-photos/%')
--     and is_sample = false
--   );
-- drop policy if exists "anon insert confirmations" on public.report_confirmations;
-- create policy "anon insert confirmations" on public.report_confirmations for insert to anon
--   with check (
--     response in ('still_true', 'no_longer')
--     and exists (select 1 from public.reports r
--                 where r.id = report_id and r.created_at > now() - interval '24 hours')
--   );
