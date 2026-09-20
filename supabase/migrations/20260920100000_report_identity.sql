-- Who sent a report, and from where.
--
-- IDENTITY
-- Reports were keyed by a device id generated in the browser. That is enough to rate limit
-- and nothing else: clearing site data makes a new person, and the same person on a phone
-- and a laptop is two. user_id is a Supabase anonymous session, which survives both and
-- can later be linked to an email without the reporter ever meeting a signup form. A
-- one-tap "the lot is full" behind a password is a report that does not get sent.
--
-- ORIGIN
-- A report says what is happening at a place right now, so where the reporter was is the
-- most useful thing we can know about it beyond its content. It is recorded, never
-- enforced: browser geolocation comes from the client and anyone willing to lie about it
-- can, so refusing on it buys no real protection while reliably blocking honest people
-- with location off, a VPN, or no signal in a river valley. Those are the people standing
-- at the full car park. Proximity ranks reports; it does not admit them.
alter table public.reports
  add column if not exists user_id uuid references auth.users (id) on delete set null,
  add column if not exists origin text
    check (origin in ('on_site', 'nearby', 'in_state', 'remote', 'unplaced')),
  add column if not exists reporter_distance_km numeric(8, 2)
    check (reporter_distance_km is null or reporter_distance_km >= 0);

comment on column public.reports.user_id is
  'Supabase auth user, usually an anonymous session. Null for reports predating this column.';
comment on column public.reports.origin is
  'How close the reporter was to the park. A ranking signal, never a gate.';
comment on column public.reports.reporter_distance_km is
  'Distance from the reporter to the park when the report was sent, so origin can be rechecked.';

-- Existing rows predate the check and are honestly described as unplaced rather than
-- backfilled with a guess.
update public.reports set origin = 'unplaced' where origin is null;

create index if not exists reports_user_id_idx on public.reports (user_id, created_at desc);

-- Reviews carry the same identity, for the same reason: a review is worth more when it is
-- attached to someone who can build a history than to a browser profile.
alter table public.reviews
  add column if not exists user_id uuid references auth.users (id) on delete set null;

comment on column public.reviews.user_id is
  'Supabase auth user, usually an anonymous session. Null for reviews predating this column.';

create index if not exists reviews_user_id_idx on public.reviews (user_id, created_at desc);
