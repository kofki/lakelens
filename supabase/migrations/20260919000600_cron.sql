-- =============================================================================
-- LakeLens migration 6 — pg_cron jobs
-- Each job asks pg_net to GET a Next.js route handler on the deployed app,
-- authenticated with `Authorization: Bearer <CRON_SECRET>`. The app URL and the
-- secret are read at RUN time from Vault, so this file contains no secrets.
--
--   ONE-TIME SETUP (never in a migration — see supabase/migrations/README.md):
--     select vault.create_secret('https://<your-app>.vercel.app', 'app_url');
--     select vault.create_secret('<CRON_SECRET>', 'cron_secret');
--
-- Schedules are UTC. Minutes are staggered so jobs don't collide.
-- Idempotent: cron.schedule() with an existing job name overwrites that job.
-- pg_net is async: the request fires when the job's transaction commits and
-- the response lands in net._http_response (kept ~6 h). Default pg_net timeout
-- is 2 s, so every call raises it to 30 s.
-- =============================================================================

-- USGS gauges (flow, stage, water temp) — every 30 minutes
select cron.schedule(
  'lakelens-usgs',
  '*/30 * * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/cron/usgs',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 30000
  ) as request_id;
  $$
);

-- Weather (NWS, Open-Meteo fallback) — hourly at :07
select cron.schedule(
  'lakelens-weather',
  '7 * * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/cron/weather',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 30000
  ) as request_id;
  $$
);

-- NWS alerts matched to park zones/counties — hourly at :13
select cron.schedule(
  'lakelens-alerts',
  '13 * * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/cron/alerts',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 30000
  ) as request_id;
  $$
);

-- US public holidays + long weekends (Nager.Date) — 03:00 UTC on the 1st of each month
select cron.schedule(
  'lakelens-holidays',
  '0 3 1 * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/cron/holidays',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 30000
  ) as request_id;
  $$
);

-- Prune old conditions_snapshots / expired alerts — daily 04:00 UTC
select cron.schedule(
  'lakelens-prune',
  '0 4 * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/cron/prune',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 30000
  ) as request_id;
  $$
);
