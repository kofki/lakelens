-- =============================================================================
-- LakeLens migration 4 — report rate limit (DB-level backstop)
-- Triggers fire for every insert path, including the service_role client used
-- by the submit-report Edge Function and the /api/reports fallback, so this is
-- the guard that holds even if the application-level check is bypassed.
-- Rule: max 5 reports per device_id per rolling 10 minutes.
-- Seeded sample reports (is_sample = true, only settable by the seed script via
-- the secret key) are exempt so `supabase/seed.sql` can insert several demo
-- reports for one device in a single run.
-- Idempotent: create or replace function; drop trigger if exists.
-- =============================================================================

-- Supporting index lives in the schema migration; repeated here defensively.
create index if not exists reports_device_created_idx
  on public.reports (device_id, created_at desc);

create or replace function public.enforce_report_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_sample then
    return new;
  end if;

  if (
    select count(*)
    from public.reports
    where device_id = new.device_id
      and created_at > now() - interval '10 minutes'
  ) >= 5 then
    raise exception 'rate_limited: max 5 reports per 10 minutes per device'
      using errcode = 'P0001';
  end if;

  return new;
end
$$;

-- Nothing but the trigger should call this.
revoke all on function public.enforce_report_rate_limit() from public, anon, authenticated;

drop trigger if exists reports_rate_limit on public.reports;
create trigger reports_rate_limit
  before insert on public.reports
  for each row execute function public.enforce_report_rate_limit();
