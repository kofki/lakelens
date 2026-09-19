-- =============================================================================
-- LakeLens migration 1 — schema
-- Tables mirror lib/types.ts (snake_case, same column names) so Supabase rows
-- pass straight through to the app. Enum-like columns use CHECK constraints
-- (not Postgres enums) so values can be extended with a plain ALTER.
-- Idempotent: create table/index if not exists, create or replace, drop
-- trigger if exists before create.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- parks
-- ---------------------------------------------------------------------------
create table if not exists public.parks (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique,
  name                 text not null,
  type                 text not null
                         constraint parks_type_check
                         check (type in ('spring', 'lake', 'river', 'beach')),
  operator             text not null
                         constraint parks_operator_check
                         check (operator in ('state', 'county', 'private')),
  lat                  double precision not null
                         constraint parks_lat_check check (lat between -90 and 90),
  lng                  double precision not null
                         constraint parks_lng_check check (lng between -180 and 180),
  coverage_tier        text not null default 'basic'
                         constraint parks_coverage_tier_check
                         check (coverage_tier in ('basic', 'deep')),
  swimming_verified    boolean not null default false,
  guarded              text not null default 'unknown'
                         constraint parks_guarded_check
                         check (guarded in ('yes', 'no', 'unknown')),
  hours                text,
  fees                 text,
  reservation_required boolean not null default false,
  reservation_url      text,
  rules                jsonb not null default '{}'::jsonb,
  usgs_site_id         text,
  river_gauge_site_id  text,
  gauge_distance_km    double precision
                         constraint parks_gauge_distance_km_check
                         check (gauge_distance_km is null or gauge_distance_km >= 0),
  nws_grid             jsonb,
  nws_zone             text,
  nws_county           text,
  -- "HH:MM" local (America/New_York). Stored as text, not `time`, so PostgREST
  -- returns exactly the "HH:MM" string the app contract (lib/types.ts) expects.
  typical_closure_time text
                         constraint parks_typical_closure_time_check
                         check (typical_closure_time is null
                                or typical_closure_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  cavern_warning       boolean not null default false,
  safety_notes         text,
  official_url         text,
  photo_url            text,
  entrance_notes       text,
  -- {"open":"MM-DD","close":"MM-DD","note"?:string} or null = swim area open year-round
  swim_season          jsonb,
  description          text,
  updated_at           timestamptz not null default now()
);

-- Belt and braces for a pre-existing parks table (the task calls this column out).
alter table public.parks add column if not exists description text;

comment on table  public.parks is 'Florida springs / state-park swim areas. Status is DERIVED at request time from park_alerts, swim_season, reports and the prediction — never stored here.';
comment on column public.parks.typical_closure_time is 'HH:MM local time (America/New_York) the park typically fills on weekends/holidays; null = unknown.';
comment on column public.parks.swim_season is 'JSON {"open":"MM-DD","close":"MM-DD","note"?}; outside this window the park is Closed. Null = open year-round.';
comment on column public.parks.rules is 'JSON ParkRules {alcohol?, tubing?, pets?, life_jackets?, other?: string[]}.';
comment on column public.parks.nws_grid is 'JSON NwsGrid {gridId, gridX, gridY, forecast, forecastHourly} cached from api.weather.gov/points.';

create index if not exists parks_coverage_tier_idx on public.parks (coverage_tier);

-- ---------------------------------------------------------------------------
-- accessibility (1:1 with parks)
-- ---------------------------------------------------------------------------
create table if not exists public.accessibility (
  park_id              uuid primary key references public.parks (id) on delete cascade,
  water_access         text not null default 'unknown'
                         constraint accessibility_water_access_check
                         check (water_access in ('yes', 'limited', 'no', 'unknown')),
  entry_type           text not null default 'unknown'
                         constraint accessibility_entry_type_check
                         check (entry_type in ('ramp', 'stairs', 'dock_ladder', 'sloped_bank', 'sand', 'other', 'unknown')),
  ada_parking          boolean,
  parking_to_water_m   integer
                         constraint accessibility_parking_to_water_m_check
                         check (parking_to_water_m is null or parking_to_water_m >= 0),
  accessible_restroom  boolean,
  surface              text not null default 'unknown'
                         constraint accessibility_surface_check
                         check (surface in ('paved', 'boardwalk', 'sand', 'natural', 'unknown')),
  wheelchair_loaner    boolean,
  handrails            boolean,
  shade                boolean,
  depth_at_entry_note  text,
  service_animals_note text,
  verified             boolean not null default false,
  source               text,
  updated_at           timestamptz not null default now()
);

comment on table public.accessibility is 'Accessibility facts per park. verified=false rows must be labelled Unverified in the UI; null booleans render as "unknown" text.';

-- ---------------------------------------------------------------------------
-- parking_lots
-- ---------------------------------------------------------------------------
create table if not exists public.parking_lots (
  id          uuid primary key default gen_random_uuid(),
  park_id     uuid not null references public.parks (id) on delete cascade,
  name        text not null,
  lat         double precision not null
                constraint parking_lots_lat_check check (lat between -90 and 90),
  lng         double precision not null
                constraint parking_lots_lng_check check (lng between -180 and 180),
  fee         text,
  capacity    integer
                constraint parking_lots_capacity_check check (capacity is null or capacity >= 0),
  ada_spaces  integer
                constraint parking_lots_ada_spaces_check check (ada_spaces is null or ada_spaces >= 0),
  is_overflow boolean not null default false,
  source      text not null default 'curated'
                constraint parking_lots_source_check check (source in ('osm', 'curated')),
  notes       text
);

create index if not exists parking_lots_park_id_idx on public.parking_lots (park_id);

-- ---------------------------------------------------------------------------
-- conditions_snapshots (append-only; latest per park+source via the view)
-- ---------------------------------------------------------------------------
create table if not exists public.conditions_snapshots (
  id         uuid primary key default gen_random_uuid(),
  park_id    uuid not null references public.parks (id) on delete cascade,
  source     text not null
               constraint conditions_snapshots_source_check
               check (source in ('usgs', 'nws', 'open-meteo')),
  payload    jsonb not null,
  fetched_at timestamptz not null default now()
);

comment on table public.conditions_snapshots is 'Append-only ingest log. payload = UsgsPayload | WeatherPayload (lib/types.ts). Pruned by /api/cron/prune.';

create index if not exists conditions_snapshots_park_source_fetched_idx
  on public.conditions_snapshots (park_id, source, fetched_at desc);

-- One newest row per (park_id, source). security_invoker so the caller's RLS
-- (public read) applies rather than the view owner's.
create or replace view public.latest_conditions
  with (security_invoker = true)
as
  select distinct on (park_id, source)
    id, park_id, source, payload, fetched_at
  from public.conditions_snapshots
  order by park_id, source, fetched_at desc;

comment on view public.latest_conditions is 'Newest conditions_snapshots row per (park_id, source).';

-- ---------------------------------------------------------------------------
-- park_alerts (closures are DATA: an active kind=closure row closes the park)
-- ---------------------------------------------------------------------------
create table if not exists public.park_alerts (
  id              uuid primary key default gen_random_uuid(),
  park_id         uuid not null references public.parks (id) on delete cascade,
  kind            text not null
                    constraint park_alerts_kind_check
                    check (kind in ('closure', 'notice', 'nws')),
  text            text not null,
  source          text not null default 'manual',
  official_url    text,
  severity        text,
  starts_at       timestamptz,
  ends_at         timestamptz,
  hash            text not null unique,
  first_seen      timestamptz not null default now(),
  last_seen       timestamptz not null default now(),
  active          boolean not null default true,
  last_checked_at timestamptz,
  constraint park_alerts_window_check
    check (starts_at is null or ends_at is null or ends_at >= starts_at)
);

comment on table  public.park_alerts is 'Official/NWS alerts. A row with kind=closure, active=true, starts_at<=now and (ends_at null or > now) makes the park Closed; deactivating or expiring it auto-reopens the park.';
comment on column public.park_alerts.hash is 'Stable dedupe key (e.g. sha1 of park_slug+kind+text, or the NWS alert id).';

create index if not exists park_alerts_park_active_idx
  on public.park_alerts (park_id) where active;
create index if not exists park_alerts_active_kind_idx
  on public.park_alerts (active, kind);

-- ---------------------------------------------------------------------------
-- reports (one-tap user reports)
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id         uuid primary key default gen_random_uuid(),
  park_id    uuid not null references public.parks (id) on delete cascade,
  category   text not null
               constraint reports_category_check
               check (category in ('entry', 'conditions', 'parking', 'accessibility')),
  -- Union of REPORT_VALUES in lib/types.ts
  value      text not null
               constraint reports_value_check
               check (value in (
                 'got_in', 'turned_away', 'line',
                 'crowded', 'water_high', 'water_murky', 'gator', 'launch_closed',
                 'lot_full', 'overflow_open',
                 'ramp_blocked', 'wheelchair_available', 'restroom_closed'
               )),
  note       text
               constraint reports_note_length_check
               check (note is null or char_length(note) <= 280),
  photo_url  text,
  device_id  uuid not null,
  is_sample  boolean not null default false,
  created_at timestamptz not null default now(),
  -- value must belong to its category (mirrors REPORT_VALUES exactly)
  constraint reports_category_value_check check (
       (category = 'entry'         and value in ('got_in', 'turned_away', 'line'))
    or (category = 'conditions'    and value in ('crowded', 'water_high', 'water_murky', 'gator', 'launch_closed'))
    or (category = 'parking'       and value in ('lot_full', 'overflow_open'))
    or (category = 'accessibility' and value in ('ramp_blocked', 'wheelchair_available', 'restroom_closed'))
  )
);

comment on table  public.reports is 'Anonymous one-tap reports. Inserted only by the submit-report Edge Function (service role) or the /api/reports fallback; never directly by the browser.';
comment on column public.reports.is_sample is 'Seeded demo data — UI must label it "Sample data". Only the seed script sets this.';

create index if not exists reports_park_created_idx
  on public.reports (park_id, created_at desc);
create index if not exists reports_device_created_idx
  on public.reports (device_id, created_at desc);

-- ---------------------------------------------------------------------------
-- report_confirmations ("Still true?" answers)
-- ---------------------------------------------------------------------------
create table if not exists public.report_confirmations (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references public.reports (id) on delete cascade,
  device_id  uuid not null,
  response   text not null
               constraint report_confirmations_response_check
               check (response in ('still_true', 'no_longer')),
  created_at timestamptz not null default now()
);

create index if not exists report_confirmations_report_created_idx
  on public.report_confirmations (report_id, created_at desc);

-- ---------------------------------------------------------------------------
-- holidays / long_weekends (US public holidays from Nager.Date)
-- ---------------------------------------------------------------------------
create table if not exists public.holidays (
  date date primary key,
  name text not null
);

create table if not exists public.long_weekends (
  start_date date primary key,
  end_date   date not null,
  constraint long_weekends_range_check check (end_date >= start_date)
);

-- ---------------------------------------------------------------------------
-- updated_at trigger (parks, accessibility)
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists parks_set_updated_at on public.parks;
create trigger parks_set_updated_at
  before update on public.parks
  for each row execute function public.set_updated_at();

drop trigger if exists accessibility_set_updated_at on public.accessibility;
create trigger accessibility_set_updated_at
  before update on public.accessibility
  for each row execute function public.set_updated_at();
