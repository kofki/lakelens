/**
 * lib/prediction.ts — additive closure-risk score → PredictionLevel + predicted fill time.
 *
 * Scoring (documented here and surfaced as plain-language reasons):
 *   weekend ........................ +2
 *   holiday or holiday weekend ..... +3
 *   calendar event ................. +eventWeight (default 1 per event)
 *   forecast high >= 90 °F ......... +1, and >= 95 °F a further +2 (cumulative 3)
 *   rain probability >= 50 % ....... −2
 * Level: score <= 0 → none, 1–2 → possible, >= 3 → likely.
 * Overrides: an active closure alert (kind=closure) or being out of swim season → closed.
 * Predicted time: park.typical_closure_time (HH:MM local) on the day, shifted EARLIER by
 *   25 min per point above 2, only when level != none and a typical time is known.
 * Confidence: high = weather present + typical time known + deep tier; medium = one of
 *   those missing; low = two or more missing.
 * Always an estimate (isEstimate: true) — the UI must label it as such.
 * Pure TS: no React / Next / DOM, no date libraries.
 */
import type { DayContext, Park, ParkAlert, Prediction, PredictionLevel, WeatherPayload } from "./types";
import { DEFAULT_TZ, formatClock, localDateKey, zonedTimeToUtc } from "./freshness";
import { isValidDateKey } from "./holidays";
import { activeClosureAlerts } from "./parkStatus";
import { isInSwimSeason, swimSeasonReason } from "./seasonal";

export interface PredictionInput {
  park: Park;
  dayContext: DayContext;
  weather: WeatherPayload | null;
  alerts: ParkAlert[];
}

export const POINTS = {
  weekend: 2,
  holiday: 3,
  hot: 1,
  veryHot: 2,
  rain: -2,
} as const;
export const HOT_F = 90;
export const VERY_HOT_F = 95;
export const RAIN_PROB_THRESHOLD = 50;
export const MINUTES_EARLIER_PER_POINT = 25;
export const NO_TYPICAL_TIME_REASON = "No typical fill time known";
export const QUIET_WEEKDAY_REASON = "Weekday — closures are rare";

/** Parse "HH:MM" or "HH:MM:SS" (Postgres `time`) → { hour, minute } or null. */
export function parseClock(value: string | null | undefined): { hour: number; minute: number } | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

export function scoreToLevel(score: number): PredictionLevel {
  if (score <= 0) return "none";
  if (score <= 2) return "possible";
  return "likely";
}

function pickForecast(weather: WeatherPayload | null, dateKey: string, todayKey: string): { highF: number | null; rainProb: number | null } {
  if (!weather) return { highF: null, rainProb: null };
  const day = Array.isArray(weather.daily) ? weather.daily.find((d) => d.date === dateKey) : undefined;
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  if (dateKey === todayKey) {
    return {
      highF: num(weather.today?.highF) ?? num(day?.highF),
      rainProb: num(weather.today?.rainProbMax) ?? num(day?.rainProb),
    };
  }
  return { highF: num(day?.highF) ?? num(weather.today?.highF), rainProb: num(day?.rainProb) ?? num(weather.today?.rainProbMax) };
}

export function predictClosure(input: PredictionInput, now: Date, tz: string = DEFAULT_TZ): Prediction {
  const { park, dayContext, weather, alerts } = input;
  const todayKey = localDateKey(now, tz);
  const dateKey = isValidDateKey(dayContext?.date) ? dayContext.date : todayKey;
  const typical = parseClock(park.typical_closure_time);

  const missing = (weather ? 0 : 1) + (typical ? 0 : 1) + (park.coverage_tier === "deep" ? 0 : 1);
  const confidence: Prediction["confidence"] = missing === 0 ? "high" : missing === 1 ? "medium" : "low";

  // ---- calendar ----
  let score = 0;
  const reasons: string[] = [];
  const holidayLabel = dayContext.holidayName ? ` (${dayContext.holidayName})` : "";
  if (dayContext.isHoliday) {
    score += POINTS.holiday;
    reasons.push(`Holiday${holidayLabel}`);
  } else if (dayContext.isHolidayWeekend) {
    score += POINTS.holiday;
    reasons.push(`Holiday weekend${holidayLabel}`);
  }
  if (dayContext.isWeekend) {
    score += POINTS.weekend;
    reasons.push("Weekend — parks fill faster");
  }
  if (dayContext.events.length > 0) {
    const w = Number.isFinite(dayContext.eventWeight) ? dayContext.eventWeight : dayContext.events.length;
    score += w;
    for (const name of dayContext.events) reasons.push(`${name} — extra crowds expected`);
  }
  if (!dayContext.isWeekend && !dayContext.isHoliday && !dayContext.isHolidayWeekend && dayContext.events.length === 0) {
    reasons.push(QUIET_WEEKDAY_REASON);
  }

  // ---- weather ----
  const { highF, rainProb } = pickForecast(weather, dateKey, todayKey);
  if (highF !== null) {
    if (highF >= VERY_HOT_F) {
      score += POINTS.hot + POINTS.veryHot;
      reasons.push(`Forecast high ${Math.round(highF)}°F — extreme heat draws crowds`);
    } else if (highF >= HOT_F) {
      score += POINTS.hot;
      reasons.push(`Forecast high ${Math.round(highF)}°F`);
    }
  }
  if (rainProb !== null && rainProb >= RAIN_PROB_THRESHOLD) {
    score += POINTS.rain;
    reasons.push(`Rain likely (${Math.round(rainProb)}%) — crowds thin out`);
  }
  if (!weather) reasons.push("No forecast available — estimate uses the calendar only");

  // ---- overrides: official closure / out of season ----
  const closure = activeClosureAlerts(alerts ?? [], now)[0];
  if (closure) {
    return {
      level: "closed",
      predictedTime: null,
      predictedTimeLabel: null,
      confidence: "high",
      score,
      reasons: [`Official closure: ${closure.text}`],
      isEstimate: true,
    };
  }
  if (!isInSwimSeason(park.swim_season, now, tz)) {
    const why = swimSeasonReason(park.swim_season, now, tz) ?? "Closed for the season";
    return {
      level: "closed",
      predictedTime: null,
      predictedTimeLabel: null,
      confidence: "high",
      score,
      reasons: [why],
      isEstimate: true,
    };
  }

  // ---- level + predicted time ----
  const level = scoreToLevel(score);
  let predictedTime: string | null = null;
  let predictedTimeLabel: string | null = null;

  if (level !== "none") {
    if (typical) {
      const shiftMin = Math.max(0, score - 2) * MINUTES_EARLIER_PER_POINT;
      const base = zonedTimeToUtc(dateKey, typical.hour, typical.minute, tz);
      const shifted = new Date(base.getTime() - shiftMin * 60e3);
      predictedTime = shifted.toISOString();
      const totalMin = typical.hour * 60 + typical.minute - shiftMin;
      const clampMin = ((totalMin % 1440) + 1440) % 1440;
      predictedTimeLabel = `around ${formatClock(Math.floor(clampMin / 60), clampMin % 60)}`;
      const when = dayContext.isHoliday || dayContext.isHolidayWeekend ? "on holidays" : dayContext.isWeekend ? "on weekends" : "on busy days";
      reasons.push(`Usually fills around ${formatClock(typical.hour, typical.minute)} ${when}`);
      if (shiftMin > 0) reasons.push(`Expected ${shiftMin} min earlier than usual today`);
    } else {
      reasons.push(NO_TYPICAL_TIME_REASON);
    }
  }

  return {
    level,
    predictedTime,
    predictedTimeLabel,
    confidence,
    score,
    reasons,
    isEstimate: true,
  };
}
