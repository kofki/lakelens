import { CloudRain, Droplets, Gauge, Thermometer, Waves, Wind } from "lucide-react";
import type { ParkBundle, UsgsReading } from "@/lib/types";
import { describeFlow, describeWaterTemp, describeWeather } from "@/lib/plainLanguage";
import { STALE, formatLocalDate, isStale, relativeTime } from "@/lib/freshness";
import { Badge } from "@/components/ui/Badge";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { Section } from "@/components/ui/Section";
import { StatTile, type StatTone } from "@/components/ui/StatTile";

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

export function ConditionsCard({ bundle, now }: ConditionsCardProps) {
  const { park, weather, weatherFetchedAt, usgs, usgsFetchedAt } = bundle;
  const readings = usgs?.readings ?? [];
  const sites = [park.usgs_site_id, park.river_gauge_site_id];

  const flow = describeFlow(usgs, park);
  const temp = describeWaterTemp(usgs, park);
  const discharge = pickReading(readings, "00060", sites);
  const level = pickReading(readings, "63160", sites) ?? pickReading(readings, "00065", sites);
  const tempReading = pickReading(readings, "00010", sites);
  const usesRiverGauge = !!park.river_gauge_site_id && [discharge, level, tempReading].some((r) => r?.site === park.river_gauge_site_id);

  const weatherStale = isStale(weatherFetchedAt, STALE.weather, now);
  const usgsStale = isStale(usgsFetchedAt, STALE.usgs, now);
  const flowTone: StatTone = flow.level === "high" ? "warn" : flow.level === "normal" ? "good" : "neutral";
  const rain = weather?.today.rainProbMax ?? null;
  const rainTone: StatTone = rain === null ? "neutral" : rain >= 50 ? "warn" : "good";

  const attribution = [
    weather ? `Weather: ${providerLabel(weather.provider)}` : "Weather: not available",
    discharge || level || tempReading
      ? `Water: USGS gauge ${(discharge ?? level ?? tempReading)!.site}`
      : park.usgs_site_id || park.river_gauge_site_id
        ? "Water: USGS (no recent reading)"
        : "Water: no gauge for this park",
  ].join(" · ");

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
      </p>

      {weather ? (
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3 md:flex-col md:items-stretch">
          <div>
            <p className="text-5xl font-extrabold leading-none text-cocoa">
              {weather.current.tempF !== null ? `${Math.round(weather.current.tempF)}°F` : "—"}
            </p>
            <p className="mt-1 text-sm font-bold text-mocha">{describeWeather(weather, now)}</p>
            <LastUpdated at={weatherFetchedAt} source={providerLabel(weather.provider)} stale={weatherStale} className="mt-1" />
          </div>
          {weather.daily.length > 0 && (
            <ol className="flex gap-2 overflow-x-auto pb-1 md:grid md:grid-cols-7 md:overflow-visible" aria-label="Seven-day outlook">
              {weather.daily.slice(0, 7).map((d) => (
                <li key={d.date} className="min-w-14 rounded-xl bg-cream px-2 py-1.5 text-center md:min-w-0">
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
        <StatTile
          icon={<Waves aria-hidden="true" focusable="false" />}
          label="Flow"
          value={discharge ? `${Math.round(discharge.value).toLocaleString()} cfs` : "—"}
          descriptor={flow.sentence}
          tone={flowTone}
          percent={discharge && flow.level !== "unknown" ? (flow.level === "high" ? 90 : 45) : null}
          footnote={discharge ? `Updated ${relativeTime(discharge.time, now)}${discharge.stale ? " · may be out of date" : ""}` : "No live flow gauge"}
        />
        <StatTile
          icon={<Gauge aria-hidden="true" focusable="false" />}
          label="Water level"
          value={level ? `${level.value.toFixed(2)} ft` : "—"}
          descriptor={level ? (level.parameter === "63160" ? "Stream level (NAVD88)" : "Gauge height") : "No live level gauge"}
          footnote={level ? `Updated ${relativeTime(level.time, now)}${level.stale ? " · may be out of date" : ""}` : undefined}
        />
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
        {(park.usgs_site_id || park.river_gauge_site_id) && (
          <LastUpdated at={usgsFetchedAt} source="USGS" stale={usgsStale} prefix="Water data updated" />
        )}
      </div>
    </Section>
  );
}
