-- What is actually there when you arrive: restrooms, pavilions, docks, showers, grills.
--
-- "Is there a bathroom" decides whether a family makes the drive as much as the water
-- temperature does, and no conditions feed can answer it. OpenStreetMap can: one batched
-- Overpass sweep over the 40 parks returned 267 tagged features.
--
-- Counts, not booleans: three restrooms and one restroom are different answers at a park
-- that fills up. A kind with none is ABSENT from the object rather than stored as zero,
-- because OSM not having mapped a bathroom is not evidence that there is no bathroom, and
-- the UI must be able to tell those apart.
alter table public.parks add column if not exists amenities jsonb;
alter table public.parks add column if not exists amenities_checked_at timestamptz;

comment on column public.parks.amenities is
  'OSM amenity counts, e.g. {"toilets":2,"shelter":1,"pier":1}. Absent kind means unmapped, not absent on the ground.';

create index if not exists parks_amenities_checked_at_idx on public.parks (amenities_checked_at nulls first);

-- Weekly, an hour after the parking sweep so the two never queue against Overpass at once.
select cron.schedule(
  'lakelens-amenities',
  '19 7 * * 2',
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
    jsonb_build_object('source', 'amenities')::text
  )
);
