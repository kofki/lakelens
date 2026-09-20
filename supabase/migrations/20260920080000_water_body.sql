-- The named water a park sits on.
--
-- The OpenStreetMap harvest typed every community row "lake" without checking, because the
-- state it stood in could not contain salt water. That is true and it is not enough: a
-- river sandbar, a pond and a Great Lakes city beach all arrived as "lake", and none of
-- them could say what they were on. scripts/fetch-osm-water-bodies.ts now asks OSM what
-- named water is within 400 m of each point, and a row that cannot answer is not seeded at
-- all, so this column is null only for curated parks that predate the check.
alter table public.parks
  add column if not exists water_body text;

comment on column public.parks.water_body is
  'Named lake, river or spring this swim area is on. Verified against OSM, not inferred from the park name.';
