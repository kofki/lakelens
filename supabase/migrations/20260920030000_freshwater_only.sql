-- =============================================================================
-- LakeLens migration 17: freshwater only
--
-- Beaches were 44 of the 84 parks and close to none of the product. Not one had deep
-- coverage, not one had a USGS gauge, and exactly one had a curated fill time. The
-- flagship feature does not even apply to them: a beach has no gate, so it cannot fill to
-- capacity and turn you away, which is the entire reason this app exists apart from a
-- weather app. Salt water is a different product.
--
-- What goes with them: red tide (Karenia brevis is marine) and FDOH Healthy Beaches
-- enterococcus (coastal beaches only). FDEP algal-bloom sampling stays, because
-- cyanobacteria is the freshwater analogue and is what a spring or lake actually faces.
--
-- NOAA CO-OPS stays even though almost no park uses one today: it is the water-temperature
-- source for the Great Lakes, which is where this goes next.
-- =============================================================================

-- Cascades through accessibility, parking_lots, conditions_snapshots, park_alerts,
-- reports, report_confirmations, reviews and park_forecast.
delete from public.parks where type = 'beach';

alter table public.park_forecast drop column if exists red_tide;
alter table public.park_forecast drop column if exists beach_water_quality;

select cron.unschedule('lakelens-redtide') where exists (select 1 from cron.job where jobname = 'lakelens-redtide');
select cron.unschedule('lakelens-beachwater') where exists (select 1 from cron.job where jobname = 'lakelens-beachwater');

-- The park type check no longer needs a value nothing can hold.
alter table public.parks drop constraint if exists parks_type_check;
alter table public.parks
  add constraint parks_type_check check (type in ('spring', 'lake', 'river'));
