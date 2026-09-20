-- =============================================================================
-- LakeLens migration 15: red tide and beach water quality
--
-- 44 of the 84 parks are beaches, and until now their water-quality signal was the FDEP
-- inland algal-bloom feed, which does not describe salt water at all. Two coastal sources
-- fill that in:
--
--   red_tide            FWC's Karenia brevis sampling (public ArcGIS FeatureServer)
--   beach_water_quality FDOH "Healthy Beaches" enterococcus (Caspio datapage, scraped)
--
-- Separate columns rather than one shared one, so each job owns exactly what it writes and
-- a failure in either can never blank the other. The read side picks: a beach shows the
-- coastal pair, inland water shows the FDEP algal-bloom reading.
-- =============================================================================

alter table public.park_forecast add column if not exists red_tide jsonb;
alter table public.park_forecast add column if not exists beach_water_quality jsonb;

comment on column public.park_forecast.red_tide is
  'FWC Karenia brevis: {level, label, abundance, sampledAt, distanceKm, location, sampleCount}. Beaches only.';
comment on column public.park_forecast.beach_water_quality is
  'FDOH Healthy Beaches enterococcus: {level, label, valueCfu, station, county, sampledAt, distanceKm, advisory}. Beaches only.';

do $$
declare
  job record;
begin
  for job in
    select * from (values
      -- Red tide is one cheap ArcGIS call, so it can keep pace with the algae sweep.
      ('lakelens-redtide',    '37 */6 * * *', 'redtide'),
      -- FDOH is a 34-county HTML sweep and its data only moves on an 8 to 13 day cycle.
      ('lakelens-beachwater', '53 6 * * *',   'beachwater')
    ) as t(jobname, schedule, source)
  loop
    perform cron.schedule(
      job.jobname,
      job.schedule,
      format(
        $cmd$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
                 || '/functions/v1/refresh-conditions',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'edge_secret_key')
          ),
          body := %L::jsonb,
          timeout_milliseconds := 150000
        ) as request_id;
        $cmd$,
        jsonb_build_object('source', job.source)::text
      )
    );
  end loop;
end $$;
