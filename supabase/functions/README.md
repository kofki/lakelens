# Supabase Edge Functions

## `submit-report`

The only write path for crowd reports. The browser (`lib/reports.ts`) calls it with
`supabase.functions.invoke("submit-report", { body })`, which sends the project's
`sb_publishable_` key in the `apikey` header. The function:

- validates the key with `withSupabase({ auth: "publishable" })` (`npm:@supabase/server@^1`),
  which also answers CORS/OPTIONS;
- validates the body with zod (category/value pairs mirror `lib/types.ts` `REPORT_VALUES`,
  note trimmed and <= 280 chars, uuid `device_id`/`park_id`, `photo_url` null or inside the
  public `report-photos` bucket of this project);
- rate-limits per `device_id` over a sliding 10-minute window: **5 reports**, **20 confirmations**
  (`429` + `retry_after_min` + `Retry-After` header). The DB trigger `enforce_report_rate_limit`
  is a backstop and is also surfaced as `429`;
- inserts with the service-role client (`ctx.supabaseAdmin`) and forces `is_sample = false`;
- returns `201` with the inserted row (`200` when a device re-answers a confirmation).

`verify_jwt = false` is required (see `supabase/config.toml`): publishable keys are not JWTs,
so the platform-level JWT gate would reject every anonymous browser call with 401.

### Files

```
supabase/config.toml                       # [functions.submit-report] verify_jwt = false
supabase/functions/submit-report/index.ts  # entrypoint (npm: specifiers, no import map needed)
supabase/functions/submit-report/deno.json # compiler options only
```

### Deploy

No Docker/Deno on this machine, so bundle server-side:

```bash
npx supabase login
npx supabase link --project-ref pqfhsqetrpbmeinucbfg
npx supabase functions deploy submit-report --use-api      # honours config.toml verify_jwt
```

Or via the Supabase MCP in a Claude session:

```
deploy_edge_function({
  project_id: "pqfhsqetrpbmeinucbfg",
  name: "submit-report",
  entrypoint_path: "index.ts",
  verify_jwt: false,
  files: [
    { name: "index.ts",  content: <supabase/functions/submit-report/index.ts> },
    { name: "deno.json", content: <supabase/functions/submit-report/deno.json> }
  ]
})
```

Optional secret (only needed if the public storage URL differs from `SUPABASE_URL`, e.g. a custom domain):

```bash
npx supabase secrets set PHOTO_PUBLIC_URL_PREFIX=https://<your-domain>/storage/v1/object/public/report-photos/
```

### Curl smoke test

```bash
export SUPABASE_URL=https://pqfhsqetrpbmeinucbfg.supabase.co
export PUBLISHABLE_KEY=sb_publishable_...     # Dashboard -> Project Settings -> API keys
export PARK_ID=$(uuidgen | tr A-Z a-z)        # replace with a real parks.id (e.g. select id from parks where slug='ichetucknee-springs-state-park')
export DEVICE_ID=$(uuidgen | tr A-Z a-z)

# 1) submit a report -> 201 + row
curl -i -X POST "$SUPABASE_URL/functions/v1/submit-report" \
  -H "apikey: $PUBLISHABLE_KEY" -H "Content-Type: application/json" \
  -d "{\"park_id\":\"$PARK_ID\",\"category\":\"entry\",\"value\":\"turned_away\",\"note\":\"Gate closed at 10:40\",\"device_id\":\"$DEVICE_ID\"}"

# 2) bad value for the category -> 400 { error: "invalid_payload", issues: [...] }
curl -s -X POST "$SUPABASE_URL/functions/v1/submit-report" \
  -H "apikey: $PUBLISHABLE_KEY" -H "Content-Type: application/json" \
  -d "{\"park_id\":\"$PARK_ID\",\"category\":\"parking\",\"value\":\"got_in\",\"device_id\":\"$DEVICE_ID\"}"

# 3) rate limit: the 6th report inside 10 minutes -> 429 { error: "rate_limited", retry_after_min }
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST "$SUPABASE_URL/functions/v1/submit-report" \
    -H "apikey: $PUBLISHABLE_KEY" -H "Content-Type: application/json" \
    -d "{\"park_id\":\"$PARK_ID\",\"category\":\"entry\",\"value\":\"line\",\"device_id\":\"$DEVICE_ID\"}"
done

# 4) confirm a report -> 201 (re-answering from the same device -> 200, row updated)
export REPORT_ID=<id from step 1>
curl -i -X POST "$SUPABASE_URL/functions/v1/submit-report" \
  -H "apikey: $PUBLISHABLE_KEY" -H "Content-Type: application/json" \
  -d "{\"type\":\"confirmation\",\"report_id\":\"$REPORT_ID\",\"device_id\":\"$DEVICE_ID\",\"response\":\"still_true\"}"

# 5) GET -> 405; missing/incorrect apikey -> 401 from withSupabase
curl -s -o /dev/null -w "%{http_code}\n" "$SUPABASE_URL/functions/v1/submit-report" -H "apikey: $PUBLISHABLE_KEY"
```

### Response shapes

| Status | Body |
|---|---|
| 201 / 200 | the `reports` or `report_confirmations` row |
| 400 | `{ error: "invalid_payload" \| "invalid_json" \| "unknown_park" \| "report_expired", message, issues? }` |
| 404 | `{ error: "report_not_found" }` |
| 405 | `{ error: "method_not_allowed" }` |
| 429 | `{ error: "rate_limited", retry_after_min, limit, window_min }` + `Retry-After` seconds |
| 500 | `{ error: "insert_failed" \| "internal_error", message? }` |

### Fallback

Set `NEXT_PUBLIC_REPORTS_VIA=api` to make `lib/reports.ts` POST the same JSON bodies to the
Next.js route `app/api/reports/route.ts` instead (it must return the same shapes above).
