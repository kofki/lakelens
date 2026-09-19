-- =============================================================================
-- LakeLens migration 7 — more feeds (FEEDS package)
-- No schema changes: park_alerts already allows kind='notice' with a free-text
-- source ('fdep-algae'), and conditions_snapshots already accepts 'usgs' rows for
-- every park. This file only adds one pg_cron job, using the same Vault + pg_net
-- pattern as 20260919000600_cron.sql (app_url + cron_secret secrets, 30 s timeout).
--
-- Feed cadence after this migration (all UTC):
--   lakelens-usgs     */30       every park with any gauge (data/gauges.json merged by build-seed)
--   lakelens-weather  :07 hourly every park: deep = NWS (Open-Meteo fallback), basic = Open-Meteo batches
--   lakelens-algae    23 */6     FDEP algal bloom samples (21-day window) -> park_alerts notices
-- =============================================================================

-- FDEP algal bloom sampling -> park_alerts(kind=notice, source=fdep-algae) — every 6 h at :23
select cron.schedule(
  'lakelens-algae',
  '23 */6 * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/cron/algae',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 30000
  ) as request_id;
  $$
);
