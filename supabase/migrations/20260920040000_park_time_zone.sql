-- Parks need their own time zone once the map leaves one state.
--
-- Opening hours are local wall clock ("8 a.m. to sundown"), and the status code now uses
-- them to decide whether the gate is open. Assuming Eastern is fine for Florida and wrong
-- the moment a Texas or Minnesota lake is added.
--
-- The NWS /points response already carries the IANA zone and the stations job already
-- calls it; the value was simply being thrown away.
alter table public.parks add column if not exists time_zone text;

comment on column public.parks.time_zone is
  'IANA zone from the NWS points response, e.g. America/New_York. Null falls back to Eastern.';
