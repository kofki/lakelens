-- =============================================================================
-- LakeLens migration — NOAA CO-OPS (Tides & Currents) stations for coastal parks
--
-- 34 of 44 beach parks and 2 of 6 lake parks sit on no USGS river gauge: the coast is
-- covered by NOAA CO-OPS stations instead, which publish water temperature, observed
-- water level (tide, datum MLLW) and high/low tide predictions. These two columns hold
-- the station chosen for each park by scripts/fetch-noaa-stations.ts (data/noaa_stations.json).
--
-- conditions_snapshots.source gains the value 'noaa' (its CHECK constraint is widened below)
-- and pg_cron gets a 'lakelens-noaa' job.
--
-- Idempotent: re-running this file is a no-op.
-- =============================================================================

alter table public.parks add column if not exists noaa_station_id text;
alter table public.parks add column if not exists noaa_distance_km numeric;

comment on column public.parks.noaa_station_id is
  'NOAA CO-OPS (Tides & Currents) station id, e.g. 8720218 — water temperature / tide for coastal parks.';
comment on column public.parks.noaa_distance_km is
  'Great-circle km from the swim area to that NOAA station (shown in the UI attribution line).';

create index if not exists parks_noaa_station_id_idx on public.parks (noaa_station_id) where noaa_station_id is not null;

-- conditions_snapshots.source: allow 'noaa' alongside the existing sources. Dropping and
-- recreating the CHECK is the idempotent way to widen it (no ALTER ... ADD VALUE for a check).
alter table public.conditions_snapshots drop constraint if exists conditions_snapshots_source_check;
alter table public.conditions_snapshots
  add constraint conditions_snapshots_source_check
  check (source = any (array['usgs'::text, 'noaa'::text, 'nws'::text, 'open-meteo'::text]));

-- NOAA water temperature + tide — every 30 minutes at :15, offset from the USGS job at :00/:30
-- so the two water jobs never share a pg_net window. Same Vault/pg_net pattern as
-- supabase/migrations/20260919000600_cron.sql; timeout raised to 30 s as there too.
select cron.schedule(
  'lakelens-noaa',
  '15,45 * * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/cron/noaa',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 30000
  ) as request_id;
  $$
);
