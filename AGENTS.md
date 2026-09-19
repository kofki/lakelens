# LakeLens — conventions for humans and agents

LakeLens is a mobile-first PWA for Florida springs & state-park swim areas (SASEhack 2026).
Stack: Next.js 16 App Router + TypeScript + Tailwind v4 (CSS-first tokens in `app/globals.css`), Supabase (Postgres, Edge Function `submit-report`, pg_cron), Vercel, MapLibre GL 5 via `@vis.gl/react-maplibre`.

## Product principles (non-negotiable)
- Show **"last updated"** and the source on every data point (`<LastUpdated>`).
- Label estimates as estimates (`Badge variant="estimate"`), sample data as sample (`Badge variant="sample"`), unverified as unverified.
- **Never convey status by colour alone** — always icon + text (`<StatusPill>`). Status colours live in `app/globals.css`.
- Plain language; 44×44 px tap targets; works at 200 % text zoom; visible focus; logical headings; `prefers-reduced-motion` respected.
- Closures are **data, not code**: an active `park_alerts` row with `kind='closure'` (or an out-of-season `swim_season`) makes a park Closed; deactivating/expiring it reopens the park automatically.

## Code rules
- `lib/types.ts` and `lib/status.ts` are the frozen shared contract. Do not edit them casually.
- `lib/*.ts` logic files are pure: no React, Next, DOM or map imports; accept `now: Date` as a parameter.
- Map code (`maplibre-gl`) only inside `'use client'` components loaded via `next/dynamic({ ssr: false })` from a client wrapper.
- Server components read Supabase with the plain publishable-key client (`lib/supabase/server.ts`), never with cookies, so pages stay cacheable (`export const revalidate = 60`).
- Secrets: `SUPABASE_SECRET_KEY`, `CRON_SECRET`, `ADMIN_TOKEN` are server-only. Never `NEXT_PUBLIC_`. Never commit `.env*`.
- npm on this machine: prefix installs with `NPM_CONFIG_CACHE=/private/tmp/claude-501/-Users-kenzo-Development-lakelens-demo/d905e456-18c9-4702-acac-9295b3919644/scratchpad/npm-cache` (the global cache has root-owned files).
- Tests: `npm test` (vitest, node env). Lint: `npm run lint`. Build: `npm run build`.

## File ownership (parallel work packages)
| Package | Owns |
|---|---|
| DB | `supabase/migrations/**`, `lib/database.types.ts` |
| LOGIC | `lib/{prediction,reportStatus,parkStatus,backups,freshness,holidays,seasonal,distance,plainLanguage}.ts` + their `*.test.ts` |
| DATA-deep | `data/{parks.deep,accessibility,parking_lots,alerts.manual,sample_reports,events}.json`, `scripts/build-seed.ts`, `supabase/seed.sql`, `tests/seed.test.ts` |
| DATA-basic | `data/parks.basic.json`, `data/holidays-2026-2027.json`, `scripts/fetch-*.ts`, `data/osm-cache/**` |
| INGEST | `lib/ingest/**`, `lib/supabase/**`, `lib/queries.ts`, `app/api/**`, `tests/ingest*.test.ts`, `tests/fixtures/**` |
| REPORT-FN | `supabase/functions/**`, `supabase/config.toml`, `lib/reports.ts`, `lib/deviceId.ts` |
| UI | `app/layout.tsx`, `app/about/**`, `app/offline/**`, `app/manifest.ts`, `app/icon.png`, `app/apple-icon.png`, `components/{ui,nav,pwa,a11y}/**`, `public/**`, `next.config.ts` |
| MAP | `components/{map,sheet,list}/**`, `app/page.tsx`, `app/list/**` |
| DETAIL | `app/park/**`, `app/report/**`, `components/{park,report}/**` |
| INFRA | everything else (root config, README, AGENTS.md) |
