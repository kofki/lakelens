-- =============================================================================
-- LakeLens migration 3 — storage bucket for report photos
-- Public bucket (downloads need no policy) + anon INSERT limited to
-- report-photos/reports/<device_id>/<uuid>.<ext>. No anon SELECT/UPDATE/DELETE
-- policies on purpose: no listing, no overwrite (upsert needs SELECT+UPDATE),
-- no deletes. Size/MIME limits are enforced by the Storage API at bucket level.
-- Idempotent: on conflict do update; drop policy if exists before create.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-photos',
  'report-photos',
  true,
  5242880,                                   -- 5 MiB in bytes (bigint)
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "anon upload report photos" on storage.objects;
create policy "anon upload report photos"
  on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = 'reports'   -- path: reports/<device_id>/<uuid>.<ext>
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'heic')
  );
