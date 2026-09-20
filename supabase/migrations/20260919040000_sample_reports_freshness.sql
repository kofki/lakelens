-- Keep the seeded demo reports inside the 2-hour report window.
--
-- Sample reports are written by seed.sql as `now() - interval 'N minutes'`, which is
-- correct at seed time and wrong forever after: two hours later every sample row has
-- aged out of summarizeReports()'s window, so the reports feature renders nothing at
-- all — no confirmed badge, no "Still full?" prompt, no Sample badge. The demo
-- silently deletes itself.
--
-- This shifts the whole set forward as a block, preserving the relative spacing the
-- seed data encodes (the 3-within-30-minutes grouping that produces a *confirmed*
-- status has to survive), so the newest sample report is always a few minutes old.
--
-- Real reports (is_sample = false) are never touched.

create or replace function public.refresh_sample_reports()
returns integer
language plpgsql
as $$
declare
  shift interval;
  moved integer;
begin
  select (now() - interval '8 minutes') - max(created_at)
    into shift
    from public.reports
   where is_sample = true;

  -- No sample rows, or they are already fresh enough: nothing to do.
  if shift is null or shift <= interval '0' then
    return 0;
  end if;

  update public.reports
     set created_at = created_at + shift
   where is_sample = true;
  get diagnostics moved = row_count;

  -- Confirmations hang off those reports and are filtered by the same window.
  update public.report_confirmations c
     set created_at = c.created_at + shift
    from public.reports r
   where r.id = c.report_id
     and r.is_sample = true;

  return moved;
end;
$$;

comment on function public.refresh_sample_reports() is
  'Shifts is_sample reports (and their confirmations) forward so the newest is ~8 minutes old. Demo data only.';

revoke all on function public.refresh_sample_reports() from public, anon, authenticated;

-- Every 15 minutes: the newest sample report then sits between 8 and 23 minutes old,
-- comfortably inside the 2 h window at any moment a judge opens the app.
select cron.unschedule('lakelens-sample-reports')
where exists (select 1 from cron.job where jobname = 'lakelens-sample-reports');

select cron.schedule('lakelens-sample-reports', '*/15 * * * *', $$select public.refresh_sample_reports();$$);

-- Bring the existing rows into the window right now.
select public.refresh_sample_reports();
