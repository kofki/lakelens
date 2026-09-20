/**
 * Level ramps: one word and one colour per measurement.
 *
 * Every stat on the conditions grid used to carry a sentence of descriptor text plus a
 * sentence of footnote. This is the replacement: a number, a single word, and a meter
 * whose fill and tint come from the same place, so the text and the colour can never
 * disagree. Pure TS, no React or DB imports.
 */
import type { WaterQuality } from "./types";

/** Matches StatTile's tone union. Kept here so lib/ stays free of component imports. */
export type LevelTone = "neutral" | "good" | "ok" | "warn" | "high" | "bad";

export interface Level {
  /** One word, shown under the value. */
  label: string;
  tone: LevelTone;
  /** 0-100 meter fill, or null for no meter. */
  percent: number | null;
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/**
 * WHO UV exposure categories. Florida sits at 8 to 10 most of the summer, which is why
 * this is the stat that replaced river flow on the grid: it changes the advice for
 * everyone, not just swimmers.
 */
export function uvLevel(uv: number | null | undefined): Level | null {
  if (uv == null || !Number.isFinite(uv)) return null;
  const percent = clamp((uv / 12) * 100);
  if (uv < 3) return { label: "Low", tone: "good", percent };
  if (uv < 6) return { label: "Moderate", tone: "ok", percent };
  if (uv < 8) return { label: "High", tone: "warn", percent };
  if (uv < 11) return { label: "Very high", tone: "high", percent };
  return { label: "Extreme", tone: "bad", percent };
}

/** Heat index bands, following the National Weather Service caution thresholds. */
export function feelsLikeLevel(f: number | null | undefined): Level | null {
  if (f == null || !Number.isFinite(f)) return null;
  const percent = clamp(((f - 60) / 55) * 100);
  if (f < 80) return { label: "Comfortable", tone: "good", percent };
  if (f < 90) return { label: "Warm", tone: "ok", percent };
  if (f < 103) return { label: "Caution", tone: "warn", percent };
  if (f < 125) return { label: "Extreme caution", tone: "high", percent };
  return { label: "Danger", tone: "bad", percent };
}

export function humidityLevel(pct: number | null | undefined): Level | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  if (pct < 60) return { label: "Comfortable", tone: "good", percent: pct };
  if (pct < 80) return { label: "Humid", tone: "warn", percent: pct };
  return { label: "Oppressive", tone: "high", percent: pct };
}

export function windLevel(mph: number | null | undefined): Level | null {
  if (mph == null || !Number.isFinite(mph)) return null;
  const percent = clamp((mph / 30) * 100);
  if (mph < 8) return { label: "Calm", tone: "good", percent };
  if (mph < 18) return { label: "Breezy", tone: "ok", percent };
  return { label: "Strong", tone: "warn", percent };
}

export function rainLevel(pct: number | null | undefined): Level | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  if (pct < 30) return { label: "Dry", tone: "good", percent: pct };
  if (pct < 60) return { label: "Showers", tone: "ok", percent: pct };
  return { label: "Wet", tone: "warn", percent: pct };
}

/**
 * Rain and thunder as one reading.
 *
 * They were two tiles asking the same question, and a visitor reads them together anyway:
 * a 50 % chance of rain means something different with storms in it. The meter follows the
 * rain probability, because that is the number on screen, but the WORD and the colour
 * escalate on thunder. Florida storms build fast and the rule is to leave the water at the
 * first rumble, so thunder crosses into a warning well below the halfway mark.
 */
export function precipitationLevel(
  rainPct: number | null | undefined,
  thunderPct: number | null | undefined,
): Level | null {
  const rain = rainPct != null && Number.isFinite(rainPct) ? rainPct : null;
  const thunder = thunderPct != null && Number.isFinite(thunderPct) ? thunderPct : null;
  if (rain === null && thunder === null) return null;

  const percent = rain ?? thunder ?? 0;
  if (thunder !== null && thunder >= 35) return { label: "Storms likely", tone: "bad", percent };
  if (thunder !== null && thunder >= 15) return { label: "Storms possible", tone: "warn", percent };
  if (rain === null) return { label: "Storms unlikely", tone: "good", percent };
  if (rain < 30) return { label: "Dry", tone: "good", percent };
  if (rain < 60) return { label: "Showers", tone: "ok", percent };
  return { label: "Wet", tone: "warn", percent };
}

/** Spring water sits near 72 °F all year, cold enough to tire a swimmer. */
export function waterTempLevel(f: number | null | undefined): Level | null {
  if (f == null || !Number.isFinite(f)) return null;
  const percent = clamp(((f - 50) / 45) * 100);
  if (f < 70) return { label: "Cold", tone: "high", percent };
  if (f < 78) return { label: "Cool", tone: "ok", percent };
  if (f < 88) return { label: "Warm", tone: "good", percent };
  return { label: "Very warm", tone: "warn", percent };
}

const WATER_QUALITY_TONE: Record<WaterQuality["level"], LevelTone> = {
  clear: "good",
  caution: "warn",
  avoid: "bad",
};

export function waterQualityLevel(q: WaterQuality | null | undefined): Level | null {
  if (!q) return null;
  return { label: q.label, tone: WATER_QUALITY_TONE[q.level], percent: null };
}
