import { Biohazard, CloudRain, CloudLightning, Droplets, FlaskConical, Sun, Thermometer, Waves, Wind } from "lucide-react";
import type { NoaaPayload, NoaaReading, ParkBundle, UsgsReading } from "@/lib/types";
import { describeWaterTemp } from "@/lib/plainLanguage";
import { formatLocalTime, relativeTime } from "@/lib/freshness";
import {
  beachWaterLevel,
  feelsLikeLevel,
  humidityLevel,
  rainLevel,
  redTideLevel,
  thunderLevel,
  uvLevel,
  waterQualityLevel,
  waterTempLevel,
  windLevel,
  type Level,
} from "@/lib/levels";
import { Section } from "@/components/ui/Section";
import { Sparkline } from "@/components/ui/Sparkline";
import { StatTile } from "@/components/ui/StatTile";
import { WeatherGlyph } from "@/components/ui/WeatherGlyph";
import type { ReactNode } from "react";

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

function pickNoaa(noaa: NoaaPayload | null | undefined, parameter: NoaaReading["parameter"]): NoaaReading | null {
  const r = noaa?.readings.find((x) => x.parameter === parameter) ?? null;
  return r && !r.stale ? r : null;
}

interface Tile {
  key: string;
  icon: ReactNode;
  label: string;
  value: string;
  level: Level | null;
  descriptor?: string;
}

/**
 * Only tiles with a real reading. A missing measurement renders nothing at all.
 *
 * `descriptor` overrides the level word, which matters where the value already IS the
 * level: a water-quality tile reading "Good" over "Good" says nothing twice.
 */
function tile(
  key: string,
  icon: ReactNode,
  label: string,
  value: string | null,
  level: Level | null,
  descriptor?: string | null,
): Tile | null {
  if (value == null) return null;
  const text = descriptor ?? level?.label;
  return { key, icon, label, value, level, descriptor: text && text !== value ? text : undefined };
}

const hourLabel = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? "AM" : "PM"}`;

export function ConditionsCard({ bundle, now }: ConditionsCardProps) {
  const { park, weather, usgs, noaa, forecast } = bundle;
  const readings = usgs?.readings ?? [];
  const sites = [park.usgs_site_id, park.river_gauge_site_id];

  const temp = describeWaterTemp(usgs, park);
  const noaaTemp = pickNoaa(noaa, "water_temp");
  const noaaLevel = pickNoaa(noaa, "water_level");
  const usgsLevel = pickReading(readings, "63160", sites) ?? pickReading(readings, "00065", sites);
  const level = usgsLevel && !usgsLevel.stale ? usgsLevel : null;

  const waterF = noaaTemp ? Math.round(noaaTemp.value) : temp.valueF;
  const uv = forecast?.nowUv ?? forecast?.uvPeak ?? null;
  const rain = weather?.today.rainProbMax ?? null;

  const tiles = [
    tile("feels", <Thermometer aria-hidden="true" focusable="false" />, "Feels like",
      forecast?.nowFeelsLikeF != null ? `${Math.round(forecast.nowFeelsLikeF)}°F` : null,
      feelsLikeLevel(forecast?.nowFeelsLikeF)),
    tile("uv", <Sun aria-hidden="true" focusable="false" />, "UV index",
      uv != null ? String(Math.round(uv)) : null, uvLevel(uv)),
    tile("water", <Waves aria-hidden="true" focusable="false" />, temp.typical ? "Water (typical)" : "Water temp",
      waterF != null ? `${waterF}°F` : null, waterTempLevel(waterF)),
    // A beach reads its bacteria count and its red tide; inland water reads the FDEP
    // algal-bloom sample. A park never shows both kinds of water quality.
    tile("beachwater", <FlaskConical aria-hidden="true" focusable="false" />, "Water quality",
      forecast?.beachWaterQuality ? forecast.beachWaterQuality.label : null,
      beachWaterLevel(forecast?.beachWaterQuality),
      forecast?.beachWaterQuality ? `${forecast.beachWaterQuality.valueCfu} cfu/100mL` : null),
    tile("redtide", <Biohazard aria-hidden="true" focusable="false" />, "Red tide",
      forecast?.redTide ? forecast.redTide.label : null,
      redTideLevel(forecast?.redTide),
      forecast?.redTide ? `sampled ${forecast.redTide.distanceKm} km away` : null),
    tile("quality", <FlaskConical aria-hidden="true" focusable="false" />, "Water quality",
      !forecast?.beachWaterQuality && forecast?.waterQuality ? forecast.waterQuality.label : null,
      forecast?.beachWaterQuality ? null : waterQualityLevel(forecast?.waterQuality),
      !forecast?.beachWaterQuality && forecast?.waterQuality ? `sampled ${forecast.waterQuality.distanceKm} km away` : null),
    tile("thunder", <CloudLightning aria-hidden="true" focusable="false" />, "Thunder",
      forecast?.nowThunderProb != null ? `${Math.round(forecast.nowThunderProb)}%` : null,
      thunderLevel(forecast?.nowThunderProb)),
    tile("rain", <CloudRain aria-hidden="true" focusable="false" />, "Rain today",
      rain != null ? `${rain}%` : null, rainLevel(rain)),
    tile("wind", <Wind aria-hidden="true" focusable="false" />, "Wind",
      forecast?.nowWindMph != null ? `${Math.round(forecast.nowWindMph)} mph` : null, windLevel(forecast?.nowWindMph)),
    tile("humidity", <Droplets aria-hidden="true" focusable="false" />, "Humidity",
      forecast?.nowHumidity != null ? `${Math.round(forecast.nowHumidity)}%` : null, humidityLevel(forecast?.nowHumidity)),
    tile("tide", <Waves aria-hidden="true" focusable="false" />, "Next tide",
      noaa?.nextTide ? `${noaa.nextTide.type === "H" ? "High" : "Low"} ${noaa.nextTide.valueFt.toFixed(1)} ft` : null,
      noaa?.nextTide ? { label: formatLocalTime(noaa.nextTide.time), tone: "neutral", percent: null } : null),
    tile("level", <Waves aria-hidden="true" focusable="false" />, "Water level",
      noaaLevel ? `${noaaLevel.value.toFixed(1)} ft` : level ? `${level.value.toFixed(2)} ft` : null, null),
  ].filter((t): t is Tile => t !== null);

  const daily = forecast?.daily ?? weather?.daily ?? [];
  const airF = forecast?.nowTempF ?? weather?.current.tempF ?? null;
  const shortForecast = forecast?.nowShortForecast ?? weather?.current.shortForecast ?? null;
  const uvHours = forecast?.hourly?.uv ?? null;
  const uvPeakHour = forecast?.uvPeakHour ?? null;

  // Nothing measured for this park: the whole section stays out of the page.
  if (tiles.length === 0 && airF === null && daily.length === 0) return null;

  const sources = [
    weather || forecast ? "National Weather Service" : null,
    uv != null ? "EPA" : null,
    usgs?.readings.length ? "USGS" : null,
    noaa?.readings.length ? `NOAA #${noaa.stationId}` : null,
    forecast?.beachWaterQuality ? "FDOH" : null,
    forecast?.redTide ? "FWC" : null,
    !forecast?.beachWaterQuality && forecast?.waterQuality ? "FDEP" : null,
  ].filter(Boolean);
  const asOf = forecast?.forecastAt ?? bundle.weatherFetchedAt;

  return (
    <Section id="conditions" title="Conditions today" icon={<Thermometer aria-hidden="true" focusable="false" />}>
      {/* One freshness line for the whole section, rather than a footnote per tile. */}
      {(sources.length > 0 || asOf) && (
        <p className="text-xs text-mocha">
          {sources.join(" · ")}
          {asOf && ` · as of ${formatLocalTime(asOf)}`}
        </p>
      )}

      {airF !== null && (
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3 md:flex-col md:items-stretch">
          <div>
            <p className="flex items-center gap-2 text-5xl font-extrabold leading-none text-ink">
              {Math.round(airF)}&deg;F
              <WeatherGlyph shortForecast={shortForecast} className="size-8" />
            </p>
            {shortForecast && <p className="mt-1 text-sm font-bold text-mocha">{shortForecast}</p>}
          </div>
          {daily.length > 0 && (
            <ol className="flex gap-2 overflow-x-auto pb-1 md:grid md:grid-cols-7 md:overflow-visible" aria-label="Seven-day outlook">
              {daily.slice(0, 7).map((d) => {
                const hi = "hi_f" in d ? d.hi_f : d.highF;
                const lo = "lo_f" in d ? d.lo_f : d.lowF;
                const pop = "pop" in d ? d.pop : d.rainProb;
                const text = "short_forecast" in d ? d.short_forecast : d.shortForecast;
                return (
                  <li key={d.date} className="min-w-14 rounded-xl border border-mist bg-cream px-2 py-1.5 text-center md:min-w-0">
                    <p className="text-xs font-extrabold text-cocoa">{d.name}</p>
                    <WeatherGlyph shortForecast={text} className="mx-auto my-0.5 size-4" />
                    <p className="text-sm font-bold text-cocoa">{hi !== null ? `${Math.round(hi)}°` : ""}</p>
                    <p className="text-xs text-mocha">{lo !== null ? `${Math.round(lo)}°` : ""}</p>
                    <p className="text-xs text-mocha">{pop !== null ? `${pop}%` : ""}</p>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}

      {tiles.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
          {tiles.map((t) => (
            <StatTile
              key={t.key}
              icon={t.icon}
              label={t.label}
              value={t.value}
              descriptor={t.descriptor}
              tone={t.level?.tone}
              percent={t.level?.percent ?? null}
            />
          ))}
        </div>
      )}

      {uvHours && uvHours.some((v) => v != null) && (
        <div className="mt-4 rounded-tile border border-mist bg-cream p-4">
          <p className="text-sm font-bold text-mocha">
            UV through the day
            {uvPeakHour != null && forecast?.uvPeak != null && (
              <span className="font-normal text-cocoa"> {"·"} peaks at {Math.round(forecast.uvPeak)} around {hourLabel(uvPeakHour)}</span>
            )}
          </p>
          <Sparkline
            values={uvHours}
            markIndex={uvHours.indexOf(Math.max(...uvHours.filter((v): v is number => v != null)))}
            summary={`UV index by hour${forecast?.uvPeak != null ? `, peaking at ${Math.round(forecast.uvPeak)}` : ""}.`}
          />
        </div>
      )}

      {forecast?.beachWaterQuality && (
        <p className="mt-3 text-xs text-mocha">
          {forecast.beachWaterQuality.valueCfu} cfu/100mL at {forecast.beachWaterQuality.station},{" "}
          {forecast.beachWaterQuality.distanceKm} km away, sampled {relativeTime(forecast.beachWaterQuality.sampledAt, now)}.
          {forecast.beachWaterQuality.advisory && " A swimming advisory is posted."}
        </p>
      )}

      {forecast?.redTide && forecast.redTide.level !== "none" && (
        <p className="mt-2 text-xs text-mocha">
          Red tide {forecast.redTide.abundance} at {forecast.redTide.location ?? "a nearby site"},{" "}
          {forecast.redTide.distanceKm} km away, sampled {relativeTime(forecast.redTide.sampledAt, now)}.
        </p>
      )}

      {noaaTemp && (
        <p className="mt-2 text-xs text-mocha">
          Water measured at NOAA station #{noaa?.stationId}, updated {relativeTime(noaaTemp.time, now)}.
        </p>
      )}
    </Section>
  );
}
