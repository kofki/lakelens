-- =============================================================================
-- LakeLens migration 9 — scheduled ingestion moves into Supabase
--
-- Every lakelens-* job now POSTs the `refresh-conditions` Edge Function instead of the
-- Next.js /api/cron/* routes on Vercel, so data collection no longer depends on the web
-- deployment being up (or on a CRON_SECRET shared with it).
--
-- Vault secrets read at run time (created by hand, never stored in a migration):
--   project_url      https://<ref>.supabase.co
--   edge_secret_key  the project's sb_secret_ key — the function's withSupabase({auth:"secret"})
--                    validates it from the `apikey` header (secret keys are not JWTs, so
--                    supabase/config.toml sets verify_jwt = false).
--
-- Weather is National Weather Service for every park; there is no second provider.
-- Re-running cron.schedule with the same job name replaces it, so this file is idempotent.
-- =============================================================================

do $$
declare
  job record;
  body jsonb;
begin
  for job in
    select * from (values
      ('lakelens-usgs',     '*/30 * * * *', 'usgs'),
      ('lakelens-weather',  '7 * * * *',    'weather'),
      ('lakelens-noaa',     '15,45 * * * *','noaa'),
      ('lakelens-alerts',   '13 * * * *',   'alerts'),
      ('lakelens-algae',    '23 */6 * * *', 'algae'),
      ('lakelens-holidays', '0 3 1 * *',    'holidays'),
      ('lakelens-prune',    '0 4 * * *',    'prune')
    ) as t(jobname, schedule, source)
  loop
    body := jsonb_build_object('source', job.source);
    perform cron.schedule(
      job.jobname,
      job.schedule,
      format(
        $cmd$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
                 || '/functions/v1/refresh-conditions',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'edge_secret_key')
          ),
          body := %L::jsonb,
          timeout_milliseconds := 30000
        ) as request_id;
        $cmd$,
        body::text
      )
    );
  end loop;
end $$;

-- Ops:
--   select jobname, schedule, active from cron.job order by jobname;
--   select j.jobname, d.status, left(d.return_message, 80), d.start_time
--     from cron.job_run_details d join cron.job j on j.jobid = d.jobid
--    order by d.start_time desc limit 20;
--   -- cron "succeeded" only means pg_net queued the request; the real HTTP status is here:
--   select status_code, left(content::text, 200), created from net._http_response order by created desc limit 10;
