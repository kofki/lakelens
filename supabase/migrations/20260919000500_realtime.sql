-- =============================================================================
-- LakeLens migration 5 — realtime (optional; the UI also polls every 60 s)
-- Adds public.reports to the supabase_realtime publication so the park detail
-- page can subscribe to postgres_changes INSERTs. anon receives only rows it
-- can SELECT (the "public read reports" policy).
-- Idempotent: `alter publication ... add table` errors if the table is already
-- a member, so guard with pg_publication_tables; create the publication if a
-- fresh project is somehow missing it.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'create publication supabase_realtime';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reports'
  ) then
    execute 'alter publication supabase_realtime add table public.reports';
  end if;
end
$$;

-- Not needed for INSERT-only subscriptions; enable if UPDATE payloads must
-- carry old row values:
-- alter table public.reports replica identity full;
