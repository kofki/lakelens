-- =============================================================================
-- LakeLens migration 16: visitor reviews
--
-- Reports answer "what is happening right now" and expire after two hours. A review
-- answers "was it worth the drive" and does not expire. Different lifetime, different
-- table: folding a 1-5 rating into `reports` would have made every report query filter
-- it out, and every review inherit an expiry it should not have.
--
-- One review per device per park, enforced by a unique index rather than by the Edge
-- Function alone, so a race cannot produce two.
-- =============================================================================

create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  park_id     uuid not null references public.parks (id) on delete cascade,
  rating      smallint not null
                constraint reviews_rating_check check (rating between 1 and 5),
  body        text
                constraint reviews_body_length_check check (body is null or char_length(body) <= 1000),
  -- Up to four photos. An array rather than a child table: they are never queried
  -- independently and a review is always read whole.
  photo_urls  text[] not null default '{}'
                constraint reviews_photos_count_check check (cardinality(photo_urls) <= 4),
  visited_on  date
                constraint reviews_visited_on_check check (visited_on is null or visited_on <= current_date),
  device_id   uuid not null,
  is_sample   boolean not null default false,
  created_at  timestamptz not null default now()
);

comment on table public.reviews is
  'Visitor reviews: a 1-5 rating, optional text and photos. Unlike reports these do not expire.';
comment on column public.reviews.is_sample is
  'Seeded demo data. The UI must label it "Sample data", and the score must say when it includes any.';

-- One per device per park. A real device changing its mind updates its row.
create unique index if not exists reviews_park_device_key on public.reviews (park_id, device_id);
create index if not exists reviews_park_created_idx on public.reviews (park_id, created_at desc);

-- ---------------------------------------------------------------- aggregate
-- The score shown at the top of a park page. A view rather than a stored column so it
-- cannot drift from the rows it summarises; `reviews` is small and indexed by park.
create or replace view public.park_review_stats with (security_invoker = true) as
  select
    park_id,
    count(*)::int                                  as review_count,
    round(avg(rating)::numeric, 1)                 as average_rating,
    count(*) filter (where is_sample)::int         as sample_count,
    count(*) filter (where rating = 5)::int        as count_5,
    count(*) filter (where rating = 4)::int        as count_4,
    count(*) filter (where rating = 3)::int        as count_3,
    count(*) filter (where rating = 2)::int        as count_2,
    count(*) filter (where rating = 1)::int        as count_1
  from public.reviews
  group by park_id;

-- ---------------------------------------------------------------- RLS
alter table public.reviews enable row level security;

drop policy if exists "public read reviews" on public.reviews;
create policy "public read reviews"
  on public.reviews for select to anon, authenticated using (true);

-- No insert/update/delete policies: writes go through the submit-review Edge Function
-- with the service-role key, exactly as reports do.
grant select on public.reviews to anon, authenticated;
grant select on public.park_review_stats to anon, authenticated;
revoke insert, update, delete on public.reviews from anon, authenticated;

-- ---------------------------------------------------------------- storage
-- Reuse the existing bucket, second prefix. A separate bucket would duplicate the size
-- and MIME limits with nothing else to show for it.
drop policy if exists "anon upload report photos" on storage.objects;
create policy "anon upload report photos"
  on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] in ('reports', 'reviews')
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'heic')
  );
