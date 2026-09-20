-- =============================================================================
-- LakeLens migration 11: the last of the file-backed data moves into Postgres
--
-- Three things were still living in the repo rather than the database:
--
--   data/events.json          imported by lib/queries.ts and read on every request, so
--                             adding a UF home game meant a code change and a redeploy
--   data/osm-cache/*          2.7 MB of committed Overpass / NWS / Nager responses; OSM
--                             parking only reached the app when someone re-ran a script
--   data/noaa_stations.json   never wired into build-seed.ts, so a rebuilt project came
--                             up with zero NOAA coverage
--
-- This adds the calendar_events table, gives OSM parking rows a stable identity so a
-- scheduled refresh can upsert them, and schedules the two new ingestion jobs.
-- =============================================================================

-- ---------------------------------------------------------------- calendar_events
-- Crowd-driving dates (UF home games, spring break, summer) that feed
-- lib/holidays.getDayContext and therefore the closure score. Federal holidays stay in
-- public.holidays; these are the local, curated ones a human edits between seasons.
create table if not exists public.calendar_events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  start_date  date not null,
  end_date    date not null,
  -- points added to the closure prediction score: 1 = busier than usual, 2 = much busier
  weight      integer not null default 1
                constraint calendar_events_weight_check check (weight between 0 and 5),
  source      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint calendar_events_range_check check (end_date >= start_date),
  -- one row per named event per start date, so re-seeding updates instead of duplicating
  constraint calendar_events_name_start_key unique (name, start_date)
);

create index if not exists calendar_events_range_idx on public.calendar_events (start_date, end_date);

drop trigger if exists calendar_events_set_updated_at on public.calendar_events;
create trigger calendar_events_set_updated_at
  before update on public.calendar_events
  for each row execute function public.set_updated_at();

alter table public.calendar_events enable row level security;

drop policy if exists "public read calendar_events" on public.calendar_events;
create policy "public read calendar_events"
  on public.calendar_events for select to anon, authenticated using (true);

grant select on public.calendar_events to anon, authenticated;

-- ---------------------------------------------------------------- parking_lots.osm_ref
-- "node/12345": OSM's own identity for the feature. Without it a scheduled Overpass
-- refresh has no way to tell "this lot again" from "a new lot" and would duplicate every
-- row on every run. Null for curated lots, which OSM never touches.
alter table public.parking_lots add column if not exists osm_ref text;

create unique index if not exists parking_lots_osm_ref_key
  on public.parking_lots (osm_ref) where osm_ref is not null;

-- ---------------------------------------------------------------- schedules
-- Both jobs are deliberately slow. Overpass fair use is ~100 queries/day for an
-- application and this is one batched query for every park; station assignments change
-- when a gauge is commissioned or retired, which is a matter of months.
do $$
declare
  job record;
  body jsonb;
begin
  for job in
    select * from (values
      ('lakelens-parking',  '41 5 * * 1', 'parking'),   -- Mondays, 05:41 UTC
      ('lakelens-stations', '17 6 * * 1', 'stations')   -- Mondays, 06:17 UTC
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
          timeout_milliseconds := 120000
        ) as request_id;
        $cmd$,
        body::text
      )
    );
  end loop;
end $$;
