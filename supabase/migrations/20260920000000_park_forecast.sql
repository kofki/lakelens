-- =============================================================================
-- LakeLens migration 14: park_forecast: one upserted forecast row per park
--
-- conditions_snapshots is append-only, so latest_conditions has to DISTINCT ON over the
-- whole table to answer "what is true now", and the table grows until prune runs. For a
-- forecast that is always overwritten, one row per park is both smaller and faster.
--
-- Weather now leads the product: air temperature, how it actually feels, UV and the
-- chance of thunder matter more to a swim decision than river discharge does. UV comes
-- from EPA Envirofacts, because the National Weather Service publishes none.
--
-- hourly is stored COLUMNAR (parallel arrays, implicit hourly step from start_utc). A park
-- page serialises its forecast twice, once as HTML and once as the RSC payload, so an array
-- of 48 objects with ten keys each would be most of the document.
-- =============================================================================

create table if not exists public.park_forecast (
  park_id             uuid primary key references public.parks (id) on delete cascade,
  forecast_at         timestamptz not null default now(),
  forecast_issued_at  timestamptz,

  -- Denormalised "now", so list and map cards never expand the hourly arrays.
  now_temp_f          double precision,
  now_feels_like_f    double precision,
  now_uv              double precision
                        constraint park_forecast_uv_check check (now_uv is null or now_uv between 0 and 20),
  now_humidity        double precision,
  now_wind_mph        double precision,
  now_thunder_prob    double precision
                        constraint park_forecast_thunder_check check (now_thunder_prob is null or now_thunder_prob between 0 and 100),
  now_short_forecast  text,

  uv_peak             double precision,
  uv_peak_hour        integer
                        constraint park_forecast_uv_hour_check check (uv_peak_hour is null or uv_peak_hour between 0 and 23),

  hourly              jsonb,
  daily               jsonb not null default '[]'::jsonb,

  -- Written by the algae job from FDEP/FWC sampling; the forecast job leaves it alone.
  water_quality       jsonb,

  -- {"weather":{"src":"nws","at":"..."},"uv":{"src":"epa","at":null}}, a null `at` means
  -- that upstream failed on the last run, which is how the UI knows to show nothing.
  sources             jsonb not null default '{}'::jsonb
);

comment on table public.park_forecast is
  'One upserted forecast row per park: NWS weather + NWS gridpoint extras + EPA UV, plus FDEP water quality.';
comment on column public.park_forecast.hourly is
  'Columnar hourly series: {start_utc, n, temp_f[], apparent_f[], pop[], uv[], wind_mph[], thunder[]}.';

create index if not exists park_forecast_forecast_at_idx on public.park_forecast (forecast_at desc);

alter table public.park_forecast enable row level security;

drop policy if exists "public read park_forecast" on public.park_forecast;
create policy "public read park_forecast"
  on public.park_forecast for select to anon, authenticated using (true);

grant select on public.park_forecast to anon, authenticated;

-- Hourly, offset from lakelens-weather (minute 7) so the two NWS jobs do not collide.
select cron.schedule(
  'lakelens-forecast',
  '27 * * * *',
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
      timeout_milliseconds := 150000
    ) as request_id;
    $cmd$,
    jsonb_build_object('source', 'forecast')::text
  )
);
