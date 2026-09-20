# LakeLens database migrations

Seven idempotent SQL files, applied **in file order** (the 14-digit prefix is the
version id in `supabase_migrations.schema_migrations`):

| File | What it does |
|---|---|
| `20260919000000_extensions.sql` | `pg_cron` (in `pg_catalog`, grants to `postgres`), `pg_net`, `supabase_vault` |
| `20260919000100_schema.sql` | `parks`, `accessibility`, `parking_lots`, `conditions_snapshots` (+ view `latest_conditions`), `park_alerts`, `reports`, `report_confirmations`, `holidays`, `long_weekends`; CHECK constraints for every enum-like column; indexes; `updated_at` trigger |
| `20260919000200_rls_grants.sql` | explicit grants, RLS on every table, public-read policies (Design A: no anon writes; Design B kept commented) |
| `20260919000300_storage.sql` | `report-photos` bucket (public, 5 MiB, image MIME allowlist) + anon INSERT policy scoped to `reports/*` |
| `20260919000400_rate_limit_trigger.sql` | `enforce_report_rate_limit()`: max 5 reports / 10 min / `device_id` (sample rows exempt) |
| `20260919000500_realtime.sql` | adds `public.reports` to the `supabase_realtime` publication (guarded, re-runnable) |
| `20260919000600_cron.sql` | five `cron.schedule` jobs that call the Next.js `/api/cron/*` handlers via `pg_net`, reading `app_url` + `cron_secret` from Vault |

Every statement is re-runnable (`create … if not exists`, `create or replace`,
`drop policy if exists` before `create policy`, `on conflict`, guarded `do $$`
blocks, and `cron.schedule` overwrites a job with the same name).

## Applying

Pick **one** path and stick with it: both record history in
`supabase_migrations.schema_migrations`, with different version ids, so mixing
them re-runs the SQL.

**Supabase MCP (what this repo uses):** `apply_migration` for each file in
order, with `name` = the file name minus the timestamp (`extensions`, `schema`,
`rls_grants`, `storage`, `rate_limit_trigger`, `realtime`, `cron`). Then
`list_migrations`, `get_advisors` (security), and
`generate_typescript_types` → `lib/database.types.ts`.

**Supabase CLI:** `npx supabase link --project-ref <ref>` then
`npx supabase db push` (`--dry-run` first). Types:
`npm run db:types` (needs `SUPABASE_PROJECT_REF`).

## One-time Vault secrets (never committed)

The cron jobs resolve the app URL and the shared secret from Vault at run
time. Insert them **once** from the SQL editor or MCP `execute_sql`. They must
never appear in a migration file:

```sql
select vault.create_secret('https://<your-app>.vercel.app', 'app_url');   -- no trailing slash
select vault.create_secret('<CRON_SECRET>', 'cron_secret');               -- same value as the CRON_SECRET env var on Vercel
```

`app_url` must match the deployed origin the route handlers live on
(`NEXT_PUBLIC_APP_URL`). `cron_secret` must equal the `CRON_SECRET` env var the
handlers compare against (`Authorization: Bearer <CRON_SECRET>`).

Rotate or fix a value later with:

```sql
select vault.update_secret((select id from vault.secrets where name = 'app_url'), 'https://new-url.vercel.app');
select vault.update_secret((select id from vault.secrets where name = 'cron_secret'), '<new secret>');
```

Check they exist (values stay encrypted at rest; this only lists names):

```sql
select name, created_at from vault.secrets order by name;
```

Until both secrets exist, the jobs run but `net.http_get` receives a null URL
and the run shows as failed in `cron.job_run_details`, which is harmless, and it
self-heals once the secrets are inserted.

## Jobs

| Job | Schedule (UTC) | Calls |
|---|---|---|
| `lakelens-usgs` | `*/30 * * * *` | `GET {app_url}/api/cron/usgs` |
| `lakelens-weather` | `7 * * * *` | `GET {app_url}/api/cron/weather` |
| `lakelens-alerts` | `13 * * * *` | `GET {app_url}/api/cron/alerts` |
| `lakelens-holidays` | `0 3 1 * *` | `GET {app_url}/api/cron/holidays` |
| `lakelens-prune` | `0 4 * * *` | `GET {app_url}/api/cron/prune` |

Each request carries `Authorization: Bearer <cron_secret>` and a 30 s timeout.

## Verifying

```sql
-- Registered jobs
select jobid, jobname, schedule, active from cron.job order by jobname;

-- Recent runs (status = succeeded means pg_cron queued the pg_net request; it does NOT mean the HTTP call returned 200)
select jobid, status, return_message, start_time, end_time
from cron.job_run_details
order by start_time desc
limit 20;

-- Actual HTTP outcomes (pg_net keeps ~6 h of responses)
select id, status_code, timed_out, error_msg, left(content::text, 200) as body, created
from net._http_response
order by created desc
limit 20;

-- Did the ingest land?
select park_id, source, fetched_at from public.latest_conditions order by fetched_at desc;
```

Fire a job by hand (same SQL the job runs, so it proves Vault + pg_net + the
route handler end to end):

```sql
select net.http_get(
  url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/cron/usgs',
  headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
  timeout_milliseconds := 30000
) as request_id;
-- then, a few seconds later:
select status_code, error_msg, left(content::text, 300) from net._http_response order by created desc limit 1;
```

Pause or remove a job:

```sql
select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'lakelens-usgs'), active := false);
select cron.unschedule('lakelens-usgs');
```

## Security model in one paragraph

The browser holds only the publishable key (`anon` role) and can **read**
everything and **upload** photos to `report-photos/reports/*`. It cannot insert,
update or delete any row: report writes go through the `submit-report` Edge
Function (or the `/api/reports` fallback) with the secret key, and the
`reports_rate_limit` trigger still applies to those inserts. `latest_conditions`
is a `security_invoker` view, so the caller's RLS applies. Every function sets
`search_path`. Closures are data: an active `park_alerts` row with
`kind = 'closure'` closes a park, and expiring/deactivating it reopens the park
on the next request, with no code change needed.
