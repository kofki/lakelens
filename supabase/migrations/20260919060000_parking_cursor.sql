-- Parking refresh needs a cursor.
--
-- One Overpass sweep of all 84 parks does not fit in an Edge Function invocation: the
-- public mirrors take seconds to tens of seconds per batched query and the worker is
-- killed long before the sweep finishes (WORKER_RESOURCE_LIMIT / 150 s idle timeout).
--
-- So the job walks the parks least-recently-checked first, a bounded batch per run, and
-- stamps what it covered. A daily schedule cycles the whole state every few days, and
-- the batch is small enough to finish comfortably.
--
-- Stamping also makes the OSM prune safe: the job can delete vanished lots for exactly
-- the parks it just queried, instead of having to reason about the whole table.
alter table public.parks add column if not exists osm_checked_at timestamptz;

comment on column public.parks.osm_checked_at is
  'When the parking job last completed an Overpass sweep covering this park. Null = never.';

create index if not exists parks_osm_checked_at_idx
  on public.parks (osm_checked_at nulls first);

-- Daily rather than weekly, because each run only covers a slice of the parks.
select cron.schedule(
  'lakelens-parking',
  '41 5 * * *',
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
    jsonb_build_object('source', 'parking')::text
  )
);
