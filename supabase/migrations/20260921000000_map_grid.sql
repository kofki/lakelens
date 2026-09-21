-- The map, done in the database.
--
-- The map endpoint used to read every park in the viewport and every side table, work out
-- a status for each park in TypeScript, and then keep 400 of them. Zoomed out to the
-- country that was 22,000 statuses per pan, seven seconds, and most parks never drawn.
-- Worse, it narrowed each side table with `park_id=in.(...)` over thousands of ids, which
-- goes out as a URL: Cloudflare answered 414 and PostgREST 400, so statuses, forecasts
-- and review stars silently vanished from every scoped page.
--
-- Two pieces make the map cheap:
--
--   1. map_grid() buckets the parks in a viewport into cells and returns one row per cell.
--      A cell holding one park carries that park; a cell holding many is a count. Every
--      park is accounted for at every zoom, and the answer is a few hundred rows.
--
--   2. has_status_basis marks the parks that can have a status at all. A lake found only
--      by its public shore has no hours, season, lifeguard or verified swim area, so its
--      status is "nothing to say" by definition; only these parks (plus any with a live
--      alert or report, which are handled in the app) need the status model run for them.

create index if not exists parks_lat_lng_idx on public.parks (lat, lng);

alter table public.parks
  add column if not exists has_status_basis boolean
    generated always as (
      hours is not null
      or swim_season is not null
      or typical_closure_time is not null
      or coalesce(swimming_verified, false)
      or guarded in ('yes', 'no')
    ) stored;

create index if not exists parks_has_status_basis_idx
  on public.parks (has_status_basis) where has_status_basis;

-- One row per occupied cell of a `cell`-degree grid laid over the viewport.
--
-- cx/cy are the cell's integer coordinates, so the app can place its own per-park facts
-- (which parks are closed) into the same cells without a second round trip. lat/lng is
-- the centroid of the parks in the cell rather than the cell centre, so a bubble sits on
-- the lakes it counts instead of on a grid line.
create or replace function public.map_grid(
  west double precision,
  south double precision,
  east double precision,
  north double precision,
  cell double precision
)
returns table (
  cx integer,
  cy integer,
  lat double precision,
  lng double precision,
  n integer,
  slug text,
  name text,
  has_status_basis boolean
)
language sql
stable
parallel safe
set search_path = public
as $$
  select
    floor(p.lng / cell)::integer as cx,
    floor(p.lat / cell)::integer as cy,
    case when count(*) = 1 then min(p.lat) else avg(p.lat) end as lat,
    case when count(*) = 1 then min(p.lng) else avg(p.lng) end as lng,
    count(*)::integer as n,
    case when count(*) = 1 then min(p.slug) end as slug,
    case when count(*) = 1 then min(p.name) end as name,
    bool_or(p.has_status_basis) as has_status_basis
  from public.parks p
  where p.lat between south and north
    and p.lng between west and east
    and cell > 0
  group by 1, 2
$$;

comment on function public.map_grid is
  'Parks in a viewport bucketed into cell-degree squares: one row per occupied cell, carrying the park itself when the cell holds exactly one.';

revoke all on function public.map_grid(double precision, double precision, double precision, double precision, double precision) from public;
grant execute on function public.map_grid(double precision, double precision, double precision, double precision, double precision)
  to anon, authenticated, service_role;
