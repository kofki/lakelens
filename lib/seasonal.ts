/**
 * lib/seasonal.ts — swim-season rules (e.g. Blue Spring: Apr 1 – Nov 14, manatee closure
 * Nov 15 – Mar 31). A park with no swim_season is swimmable year-round.
 * Pure TS: no React / Next / DOM.
 */
import type { SwimSeason } from "./types";
import { DEFAULT_TZ, localParts, pad2 } from "./freshness";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function isMmDd(s: unknown): s is string {
  return typeof s === "string" && /^\d{2}-\d{2}$/.test(s);
}

/** "04-01" → "Apr 1". Returns the input unchanged when it is not "MM-DD". */
export function formatMmDd(mmdd: string): string {
  if (!isMmDd(mmdd)) return mmdd;
  const [m, d] = mmdd.split("-").map(Number);
  const name = MONTH_NAMES[m - 1];
  return name ? `${name} ${d}` : mmdd;
}

/** "Apr 1 – Nov 14" for display. */
export function formatSeasonRange(season: SwimSeason): string {
  return `${formatMmDd(season.open)} – ${formatMmDd(season.close)}`;
}

/**
 * True when the local calendar date (in `tz`) falls inside the inclusive open..close
 * window. Windows that wrap the year end (e.g. "11-01".."03-31") are supported.
 * A null/invalid season means "open all year".
 */
export function isInSwimSeason(season: SwimSeason | null, date: Date, tz: string = DEFAULT_TZ): boolean {
  if (!season || !isMmDd(season.open) || !isMmDd(season.close)) return true;
  const p = localParts(date, tz);
  const md = `${pad2(p.month)}-${pad2(p.day)}`;
  if (season.open <= season.close) return season.open <= md && md <= season.close;
  return md >= season.open || md <= season.close;
}

/**
 * Plain-language reason when the park is closed for the season, or null when swimming
 * is in season (or the park has no seasonal rule). Example:
 * "Closed for the season — swimming reopens Apr 1 (season Apr 1 – Nov 14). Manatee season."
 */
export function swimSeasonReason(season: SwimSeason | null, date: Date, tz: string = DEFAULT_TZ): string | null {
  if (!season || isInSwimSeason(season, date, tz)) return null;
  let text = `Closed for the season — swimming reopens ${formatMmDd(season.open)} (season ${formatSeasonRange(season)})`;
  if (season.note) text += `. ${season.note}`;
  return text;
}
