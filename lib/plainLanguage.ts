/**
 * lib/plainLanguage.ts — turns raw USGS / weather / report data into short, plain
 * sentences. Every sentence says when a value is typical rather than measured.
 * Pure TS: no React / Next / DOM.
 */
import type { Park, ReportSummary, UsgsPayload, UsgsReading, WeatherPayload } from "./types";
import { REPORT_VALUE_LABELS } from "./types";
import { IMPLIES_LEVEL } from "./reportStatus";
import { STALE, isStale, relativeTime } from "./freshness";

/** Florida spring water sits near 72 °F all year; used only when no live reading exists. */
export const TYPICAL_SPRING_TEMP_F = 72;

function findReading(usgs: UsgsPayload | null, parameter: UsgsReading["parameter"]): UsgsReading | null {
  if (!usgs || !Array.isArray(usgs.readings)) return null;
  const matches = usgs.readings.filter((r) => r.parameter === parameter && Number.isFinite(r.value));
  if (matches.length === 0) return null;
  matches.sort((a, b) => (Date.parse(b.time) || 0) - (Date.parse(a.time) || 0));
  return matches[0];
}

function gaugeNote(park: Park): string {
  const km = park.gauge_distance_km;
  if (typeof km === "number" && Number.isFinite(km) && km > 0.5) {
    const shown = km >= 10 ? Math.round(km) : Math.round(km * 10) / 10;
    return ` (river gauge ${shown} km away)`;
  }
  return "";
}

/** e.g. { sentence: "Flow is normal — about 350 cfs", level: "normal" } */
export function describeFlow(usgs: UsgsPayload | null, park: Park): { sentence: string; level: "normal" | "high" | "unknown" } {
  if (!usgs) return { sentence: "Flow data not available yet", level: "unknown" };
  const flag = usgs.flowFlag === "high" || usgs.flowFlag === "normal" ? usgs.flowFlag : "unknown";
  const discharge = findReading(usgs, "00060");
  const amount = discharge ? ` — about ${Math.round(discharge.value).toLocaleString("en-US")} cfs` : "";
  const stale = discharge?.stale ? " (reading is more than 6 hours old)" : "";

  if (flag === "high") {
    return {
      sentence: `Flow is higher than usual${amount}${stale} — expect a stronger current${gaugeNote(park)}`,
      level: "high",
    };
  }
  if (flag === "normal") {
    return { sentence: `Flow is normal${amount}${stale}${gaugeNote(park)}`, level: "normal" };
  }
  if (discharge) {
    return { sentence: `Flow is about ${Math.round(discharge.value).toLocaleString("en-US")} cfs${stale}${gaugeNote(park)}`, level: "unknown" };
  }
  return { sentence: usgs.flowNote ?? "Flow data not available for this spring", level: "unknown" };
}

function toF(reading: UsgsReading): number {
  const unit = (reading.unit ?? "").toLowerCase();
  if (unit.includes("f")) return reading.value;
  return (reading.value * 9) / 5 + 32;
}

/**
 * Water temperature in °F. When no live reading exists for a spring we fall back to the
 * typical 72 °F and flag `typical: true` so the UI labels it "Typical", not measured.
 */
export function describeWaterTemp(usgs: UsgsPayload | null, park: Park): { valueF: number | null; sentence: string; typical: boolean } {
  const temp = findReading(usgs, "00010");
  if (temp) {
    const valueF = Math.round(toF(temp));
    const stale = temp.stale ? " (reading is more than 6 hours old)" : "";
    const cool = valueF <= 74 ? " — cool year-round spring water" : "";
    return { valueF, sentence: `Water is ${valueF}°F${cool}${stale}`, typical: false };
  }
  if (park.type === "spring") {
    return {
      valueF: TYPICAL_SPRING_TEMP_F,
      sentence: `Typically about ${TYPICAL_SPRING_TEMP_F}°F year-round (no live reading)`,
      typical: true,
    };
  }
  return { valueF: null, sentence: "Water temperature not available", typical: false };
}

/** WMO 4677 weather interpretation codes → short text. */
export function wmoToText(code: number): string {
  const table: Record<number, string> = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Freezing fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    56: "Freezing drizzle",
    57: "Heavy freezing drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    66: "Freezing rain",
    67: "Heavy freezing rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Light showers",
    81: "Showers",
    82: "Heavy showers",
    85: "Snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorms",
    96: "Thunderstorms with hail",
    99: "Severe thunderstorms with hail",
  };
  return table[code] ?? "Unknown conditions";
}

/** e.g. "88°F and partly sunny · high 94°F · 60% chance of rain" */
export function describeWeather(w: WeatherPayload | null, now: Date = new Date()): string {
  if (!w) return "Weather not available yet";
  const parts: string[] = [];
  const temp = w.current?.tempF;
  const short = (w.current?.shortForecast ?? "").trim();
  if (typeof temp === "number" && Number.isFinite(temp)) {
    parts.push(short ? `${Math.round(temp)}°F and ${short.toLowerCase()}` : `${Math.round(temp)}°F now`);
  } else if (short) {
    parts.push(short);
  }
  const high = w.today?.highF;
  if (typeof high === "number" && Number.isFinite(high)) parts.push(`high ${Math.round(high)}°F`);
  const rain = w.today?.rainProbMax;
  if (typeof rain === "number" && Number.isFinite(rain) && rain > 0) parts.push(`${Math.round(rain)}% chance of rain`);
  if (isStale(w.fetchedAt, STALE.weather, now)) parts.push("forecast may be out of date");
  return parts.length ? parts.join(" · ") : "Weather not available yet";
}

/**
 * One-line report evidence, e.g.
 * "Turned away · reported 25 min ago · 3 people confirmed · 2 said still true · sample data"
 */
export function reportLine(summary: ReportSummary, now: Date): string {
  if (!summary || summary.signal === "none" || !summary.value) return "No reports in the last 2 hours";
  const parts: string[] = [REPORT_VALUE_LABELS[summary.value] ?? summary.value];
  parts.push(`reported ${relativeTime(summary.freshestAt, now)}`);
  if (summary.count >= 2) parts.push(`${summary.count} people confirmed`);
  if (summary.confirmations > 0) parts.push(`${summary.confirmations} said still true`);
  if (IMPLIES_LEVEL[summary.value] && summary.impliesLevel === null) parts.push("now reported as no longer true");
  if (summary.contradicted) parts.push("a newer report disagrees");
  if (summary.sampleCount > 0) parts.push(summary.sampleCount === summary.count ? "sample data" : "includes sample data");
  return parts.join(" · ");
}
