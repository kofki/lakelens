-- ON CONFLICT (osm_ref) cannot use a PARTIAL unique index: PostgREST sends a bare
-- column inference spec and Postgres refuses to match it against an index with a
-- WHERE clause ("no unique or exclusion constraint matching the ON CONFLICT
-- specification").
--
-- A plain unique index is what we wanted anyway: Postgres treats NULLs as distinct by
-- default, so every curated lot can keep osm_ref NULL without colliding.
drop index if exists public.parking_lots_osm_ref_key;

create unique index if not exists parking_lots_osm_ref_key
  on public.parking_lots (osm_ref);
