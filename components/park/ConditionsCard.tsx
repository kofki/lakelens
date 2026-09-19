import { CloudRain, Droplets, Gauge, Thermometer, Waves, Wind } from "lucide-react";
import type { NoaaPayload, NoaaReading, ParkBundle, UsgsReading } from "@/lib/types";
import { describeFlow, describeWaterTemp, describeWeather } from "@/lib/plainLanguage";
import { STALE, formatLocalDate, formatLocalTime, isStale, relativeTime } from "@/lib/freshness";
import { Badge } from "@/components/ui/Badge";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { Section } from "@/components/ui/Section";
import { StatTile, type StatTone } from "@/components/ui/StatTile";
import { FlowSparkline } from "@/components/park/FlowSparkline";

export interface ConditionsCardProps {
  bundle: ParkBundle;
  now: Date;
}

function pickReading(readings: UsgsReading[], parameter: UsgsReading["parameter"], preferredSites: (string | null)[]): UsgsReading | null {
  for (const site of preferredSites) {
    if (!site) continue;
    const r = readings.find((x) => x.site === site && x.parameter === parameter);
    if (r) return r;
  }
  return readings.find((x) => x.parameter === parameter) ?? null;
}

function providerLabel(p: "nws" | "open-meteo" | undefined): string {
  return p === "open-meteo" ? "Open-Meteo" : "National Weather Service";
}

function pickNoaa(noaa: NoaaPayload | null | undefined, parameter: NoaaReading["parameter"]): NoaaReading | null {
  return noaa?.readings.find((r) => r.parameter === parameter) ?? null;
}

/** "in 2 hours (3:41 PM)" — relativeTime already renders future times as "in …". */
function tideWhen(tide: NoaaPayload["nextTide"] | undefined, now: Date): string | null {
  if (!tide) return null;
  return `${relativeTime(tide.time, now)} (${formatLocalTime(tide.time)})`;
}

export function ConditionsCard({ bundle, now }: ConditionsCardProps) {
  const { park, weather, weatherFetchedAt, usgs, usgsFetchedAt, noaa, noaaFetchedAt } = bundle;
  const readings = usgs?.readings ?? [];
  const sites = [park.usgs_site_id, park.river_gauge_site_id];
  const flowSiteId = park.usgs_site_id ?? park.river_gauge_site_id;

  const flow = describeFlow(usgs, park);
  const temp = describeWaterTemp(usgs, park);
  const discharge = pickReading(readings, "00060", sites);
  const level = pickReading(readings, "63160", sites) ?? pickReading(readings, "00065", sites);
  const tempReading = pickReading(readings, "00010", sites);
  const usesRiverGauge = !!park.river_gauge_site_id && [discharge, level, tempReading].some((r) => r?.site === park.river_gauge_site_id);

  // Coastal parks (beaches, coastal lakes) have no USGS gauge: their water data is a NOAA CO-OPS
  // station instead — water temperature and tide height above MLLW, BeachLens-style.
  const noaaTemp = pickNoaa(noaa, "water_temp");
  const noaaLevel = pickNoaa(noaa, "water_level");
  const usesNoaa = Boolean(park.noaa_station_id) && !discharge && !level && !tempReading;

  const weatherStale = isStale(weatherFetchedAt, STALE.weather, now);
  const usgsStale = isStale(usgsFetchedAt, STALE.usgs, now);
  // NOAA posts every 6 minutes; the shared 6 h "water data" threshold is plenty generous.
  const noaaStale = isStale(noaaFetchedAt ?? null, STALE.usgs, now);
  const flowTone: StatTone = flow.level === "high" ? "warn" : flow.level === "normal" ? "good" : "neutral";
  const rain = weather?.today.rainProbMax ?? null;
  const rainTone: StatTone = rain === null ? "neutral" : rain >= 50 ? "warn" : "good";

  const noaaStationLabel = noaa?.stationId
    ? `NOAA station #${noaa.stationId}${noaa.stationName ? ` (${noaa.stationName})` : ""}`
    : park.noaa_station_id
      ? `NOAA station #${park.noaa_station_id}`
      : null;

  const waterAttribution = usesNoaa
    ? noaaTemp || noaaLevel
      ? `Water: ${noaaStationLabel}`
      : `Water: ${noaaStationLabel} (no recent reading)`
    : discharge || level || tempReading
      ? `Water: USGS gauge ${(discharge ?? level ?? tempReading)!.site}`
      : park.usgs_site_id || park.river_gauge_site_id
        ? "Water: USGS (no recent reading)"
        : noaaStationLabel
          ? `Water: ${noaaStationLabel} (no recent reading)`
          : "Water: no gauge for this park";

  const attribution = [weather ? `Weather: ${providerLabel(weather.provider)}` : "Weather: not available", waterAttribution].join(" · ");

  return (
    <Section id="conditions" title="Conditions today" icon={<Thermometer aria-hidden="true" focusable="false" />}>
      <p className="text-xs text-mocha">
        {attribution}
        {usesRiverGauge && park.gauge_distance_km !== null && (
          <>
            {" "}
            · River gauge {park.gauge_distance_km.toFixed(1)} km away
          </>
        )}
        {usesNoaa && park.noaa_distance_km != null && (
          <>
            {" "}
            · Station {park.noaa_distance_km.toFixed(1)} km away
          </>
        )}
      </p>

      {weather ? (
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3 md:flex-col md:items-stretch">
          <div>
            <p className="text-5xl font-extrabold leading-none text-ink">
              {weather.current.tempF !== null ? `${Math.round(weather.current.tempF)}°F` : "—"}
            </p>
            <p className="mt-1 text-sm font-bold text-mocha">{describeWeather(weather, now)}</p>
            <LastUpdated at={weatherFetchedAt} source={providerLabel(weather.provider)} stale={weatherStale} className="mt-1" />
          </div>
          {weather.daily.length > 0 && (
            <ol className="flex gap-2 overflow-x-auto pb-1 md:grid md:grid-cols-7 md:overflow-visible" aria-label="Seven-day outlook">
              {weather.daily.slice(0, 7).map((d) => (
                <li key={d.date} className="min-w-14 rounded-xl border border-mist bg-cream px-2 py-1.5 text-center md:min-w-0">
                  <p className="text-xs font-extrabold text-cocoa">{d.name || formatLocalDate(`${d.date}T12:00:00Z`)}</p>
                  <p className="text-sm font-bold text-cocoa">{d.highF !== null ? `${Math.round(d.highF)}°` : "—"}</p>
                  <p className="text-xs text-mocha">{d.lowF !== null ? `${Math.round(d.lowF)}°` : ""}</p>
                  <p className="text-xs text-mocha">{d.rainProb !== null ? `${d.rainProb}% rain` : ""}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-mocha">Weather isn&apos;t available for this park yet.</p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        {usesNoaa ? (
          <StatTile
            icon={<Thermometer aria-hidden="true" focusable="false" />}
            label="Water temp"
            value={noaaTemp ? `${Math.round(noaaTemp.value)}°F` : "—"}
            descriptor={noaaTemp ? "Measured at the NOAA station" : "No live reading"}
            tone={noaaTemp ? "good" : "neutral"}
            footnote={
              noaaTemp
                ? `Updated ${relativeTime(noaaTemp.time, now)}${noaaTemp.stale ? " · may be out of date" : ""}`
                : "This NOAA station isn't reporting water temperature right now"
            }
          />
        ) : (
          <StatTile
            icon={<Thermometer aria-hidden="true" focusable="false" />}
            label="Water temp"
            value={temp.valueF !== null ? `${Math.round(temp.valueF)}°F` : "—"}
            descriptor={temp.typical ? "Typical for a spring" : temp.sentence}
            tone={temp.typical ? "neutral" : "good"}
            footnote={
              temp.typical
                ? "Typical value — no live reading"
                : tempReading
                  ? `Updated ${relativeTime(tempReading.time, now)}${tempReading.stale ? " · may be out of date" : ""}`
                  : undefined
            }
          />
        )}
        {usesNoaa ? (
          <StatTile
            icon={<Waves aria-hidden="true" focusable="false" />}
            label="Next tide"
            value={noaa?.nextTide ? `${noaa.nextTide.type === "H" ? "High" : "Low"} ${noaa.nextTide.valueFt.toFixed(1)} ft` : "—"}
            descriptor={noaa?.nextTide ? tideWhen(noaa.nextTide, now) ?? undefined : "No live reading"}
            footnote={noaa?.nextTide ? "NOAA tide prediction (MLLW)" : "No tide prediction for this station"}
          />
        ) : (
        <div className="flex flex-col gap-2">
          <StatTile
            icon={<Waves aria-hidden="true" focusable="false" />}
            label="Flow"
            value={discharge ? `${Math.round(discharge.value).toLocaleString()} cfs` : "—"}
            descriptor={flow.sentence}
            tone={flowTone}
            percent={discharge && flow.level !== "unknown" ? (flow.level === "high" ? 90 : 45) : null}
            footnote={discharge ? `Updated ${relativeTime(discharge.time, now)}${discharge.stale ? " · may be out of date" : ""}` : "No live flow gauge"}
          />
          {flowSiteId && <FlowSparkline parkId={park.id} siteId={flowSiteId} />}
        </div>
        )}
        {usesNoaa ? (
          <StatTile
            icon={<Gauge aria-hidden="true" focusable="false" />}
            label="Tide level"
            value={noaaLevel ? `${noaaLevel.value.toFixed(1)} ft` : "—"}
            descriptor={noaaLevel ? "Above mean low water (MLLW)" : "No live reading"}
            footnote={
              noaaLevel
                ? `Updated ${relativeTime(noaaLevel.time, now)}${noaaLevel.stale ? " · may be out of date" : ""}`
                : "This NOAA station isn't reporting a tide level right now"
            }
          />
        ) : (
          <StatTile
            icon={<Gauge aria-hidden="true" focusable="false" />}
            label="Water level"
            value={level ? `${level.value.toFixed(2)} ft` : "—"}
            descriptor={level ? (level.parameter === "63160" ? "Stream level (NAVD88)" : "Gauge height") : "No live level gauge"}
            footnote={level ? `Updated ${relativeTime(level.time, now)}${level.stale ? " · may be out of date" : ""}` : undefined}
          />
        )}
        <StatTile
          icon={<CloudRain aria-hidden="true" focusable="false" />}
          label="Rain today"
          value={rain !== null ? `${rain}%` : "—"}
          descriptor={rain === null ? "No forecast" : rain >= 50 ? "Rain likely — crowds thin out" : "Mostly dry"}
          percent={rain}
          tone={rainTone}
        />
        <StatTile
          icon={<Wind aria-hidden="true" focusable="false" />}
          label="Wind"
          value={weather?.current.windMph !== null && weather?.current.windMph !== undefined ? `${Math.round(weather.current.windMph)} mph` : "—"}
          descriptor={weather?.current.windMph !== null && weather?.current.windMph !== undefined ? (weather.current.windMph >= 15 ? "Breezy" : "Calm") : undefined}
        />
        <StatTile
          icon={<Droplets aria-hidden="true" focusable="false" />}
          label="Humidity"
          value={weather?.current.humidity !== null && weather?.current.humidity !== undefined ? `${Math.round(weather.current.humidity)}%` : "—"}
          percent={weather?.current.humidity ?? null}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {temp.typical && <Badge variant="typical">Typical ~72°F — spring-fed</Badge>}
        {usesNoaa
          ? park.noaa_station_id && (
              <LastUpdated at={noaaFetchedAt ?? null} source={`NOAA #${park.noaa_station_id}`} stale={noaaStale} prefix="Water data updated" />
            )
          : (park.usgs_site_id || park.river_gauge_site_id) && (
              <LastUpdated at={usgsFetchedAt} source="USGS" stale={usgsStale} prefix="Water data updated" />
            )}
      </div>
    </Section>
  );
}
