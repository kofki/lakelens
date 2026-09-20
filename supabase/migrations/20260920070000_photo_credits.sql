-- Photo credits, which the licences require and the app was not showing.
--
-- The curated photos are Wikimedia Commons images under CC BY or CC0. CC BY obliges us to
-- name the author and the licence wherever the image appears, and data/photos*.json has
-- carried that information since the beginning without anything rendering it. Adding
-- hundreds more images makes that a bigger problem, not a smaller one.
--
-- Stored on the park next to photo_url so a credit can never drift from the image it
-- belongs to.
alter table public.parks add column if not exists photo_author text;
alter table public.parks add column if not exists photo_license text;
alter table public.parks add column if not exists photo_source_url text;

comment on column public.parks.photo_author is
  'Attribution required by the image licence. Rendered wherever the photo is.';
comment on column public.parks.photo_license is
  'Short licence name, e.g. "CC BY 2.0" or "Public domain".';
comment on column public.parks.photo_source_url is
  'The file description page, which is where the licence and the author can be verified.';
