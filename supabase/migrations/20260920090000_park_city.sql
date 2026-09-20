-- The nearest town to each park.
--
-- Cards showed "Lake · County park", which says what kind of thing a park is and not where
-- in the country it is. With parks in more than twenty states, "Blue Lake Beach" on its own
-- is not a place anyone can locate, and the state code alone is too coarse to drive to.
-- Reverse-geocoded from OpenStreetMap Nominatim by scripts/fetch-place-names.ts; null when
-- the lookup returned only a county, which is not a town and is not shown as one.
alter table public.parks
  add column if not exists city text;

comment on column public.parks.city is
  'Nearest town or city, for display as "Town, ST". Null when no settlement could be resolved.';
