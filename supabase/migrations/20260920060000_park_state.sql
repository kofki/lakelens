-- Parks need to know which state they are in.
--
-- Nothing recorded it, so the JSON-LD told search engines every park was in Florida, the
-- rules card cited the Florida Administrative Code at any park seeded as "state", and
-- there was no key to route a region-specific data feed on. Slugs were not namespaced
-- either: "blue-spring-state-park" exists in more than one state and the seed upserts on
-- slug, so the second one would have silently overwritten the first.
alter table public.parks add column if not exists state text
  constraint parks_state_check check (state is null or state ~ '^[A-Z]{2}$');

comment on column public.parks.state is
  'Two-letter USPS code. Drives structured data, region-scoped feeds and operator labelling.';

create index if not exists parks_state_idx on public.parks (state);

-- Everything currently in the dataset is Florida.
update public.parks set state = 'FL' where state is null;

-- Crowd-driving events are regional: a University of Florida home game does not fill a
-- lake in Minnesota, and the reason line was rendering "UF home football vs Ole Miss
-- (Gainesville)" on every park in the country. Null means it applies nationwide, which is
-- what a federal holiday is.
alter table public.calendar_events add column if not exists state text
  constraint calendar_events_state_check check (state is null or state ~ '^[A-Z]{2}$');

comment on column public.calendar_events.state is
  'Two-letter USPS code, or null for an event that applies nationwide (e.g. a federal holiday).';

update public.calendar_events set state = 'FL'
 where state is null and (name ilike '%UF %' or name ilike '%FSU%' or name ilike '%spring break%');
