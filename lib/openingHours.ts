/**
 * Is the park open right now?
 *
 * The status used to read "Open" at 2 a.m., which is wrong in the most basic way: almost
 * every park in the dataset is day-use only and the gate is shut. Nothing in the model
 * knew that, because hours are a curated sentence from the park's page rather than a
 * structured field.
 *
 * This parses the sentence. The dominant pattern by far is "8 a.m. to sundown", so sunset
 * is computed rather than looked up: it needs no network call, works anywhere in the
 * country, and is accurate to about a minute, which is finer than a park gate.
 *
 * Pure TS: no React, no DB, no date library.
 */
import { DEFAULT_TZ, localParts } from "./freshness";

export interface OpeningHours {
  /** Local minutes past midnight the park opens, or null when the text does not say. */
  opensMin: number | null;
  /** Local minutes past midnight it closes, or null when it closes at sunset or is unknown. */
  closesMin: number | null;
  /** "8 a.m. to sundown": the closing time has to be computed for the date. */
  closesAtSunset: boolean;
  /** Text said the park never closes (24 hours, or no gate at all). */
  alwaysOpen: boolean;
}

const TIME_RE = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi;
const SUNSET_RE = /\b(sundown|sunset|dusk|daylight hours)\b/i;
const ALWAYS_RE = /\b(24 hours|open 24|around the clock|no gate)\b/i;

function toMinutes(hour: number, minute: number, meridiem: string): number {
  const pm = /p/i.test(meridiem);
  let h = hour % 12;
  if (pm) h += 12;
  return h * 60 + minute;
}

/**
 * Pull opening and closing times out of curated prose.
 *
 * Deliberately conservative: it spans the widest range it can see and returns nulls when
 * it cannot tell. These sentences also mention concession
 * stands, pancake houses and swim slots, so a cleverer parser would confidently pick the
 * wrong pair. A park we cannot read stays open, which is the safe direction: the app would
 * rather under-claim a closure than tell someone a park is shut when it is not.
 */
export function parseOpeningHours(text: string | null | undefined): OpeningHours {
  const out: OpeningHours = { opensMin: null, closesMin: null, closesAtSunset: false, alwaysOpen: false };
  const s = (text ?? "").trim();
  if (!s) return out;

  if (ALWAYS_RE.test(s)) {
    out.alwaysOpen = true;
    return out;
  }

  // "a.m." has to lose its full stops before any sentence split, or "8 a.m. to sundown"
  // splits after "8 a." and the hours vanish.
  const flat = s.replace(/\b([ap])\.\s?m\.?/gi, "$1m");

  // Only the first sentence: the rest is usually about concessions and rentals.
  const head = flat.split(/(?<=\.)\s+/)[0] ?? flat;
  const times: number[] = [];
  TIME_RE.lastIndex = 0;
  for (const m of head.matchAll(TIME_RE)) {
    const hour = Number(m[1]);
    const minute = Number(m[2] ?? 0);
    if (hour < 1 || hour > 12 || minute > 59) continue;
    times.push(toMinutes(hour, minute, m[3]));
  }

  if (SUNSET_RE.test(head)) {
    out.closesAtSunset = true;
    out.opensMin = times[0] ?? null;
    return out;
  }
  if (times.length >= 2) {
    // The WIDEST range, not the first pair. These sentences carry seasonal variants
    // ("9 to 7 in summer, 9 to 5 in winter") that no parser can resolve without knowing
    // the park's own calendar, so the range spans them. That errs toward open, which is
    // the direction to be wrong in: better to stay quiet than to tell someone a park is
    // shut when its summer hours are still running.
    out.opensMin = Math.min(...times);
    out.closesMin = Math.max(...times);
  }
  return out;
}

/**
 * Sunset as local minutes past midnight, via the NOAA solar-position equations.
 *
 * Accurate to roughly a minute at these latitudes, which is far finer than the thing being
 * modelled. Returns null above the Arctic Circle in the seasons where the sun does not
 * set, where the maths has no answer.
 */
export function sunsetMinutes(lat: number, lng: number, date: Date, tz: string = DEFAULT_TZ): number | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const parts = localParts(date, tz);
  // Days since 2000-01-01 12:00 UT for local noon at this longitude.
  const utcNoon = Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0);
  const n = Math.round((utcNoon - Date.UTC(2000, 0, 1, 12)) / 86400000) - lng / 360;

  const toRad = Math.PI / 180;
  const meanAnomaly = (357.5291 + 0.98560028 * n) % 360;
  const center =
    1.9148 * Math.sin(meanAnomaly * toRad) + 0.02 * Math.sin(2 * meanAnomaly * toRad) + 0.0003 * Math.sin(3 * meanAnomaly * toRad);
  const eclipticLong = (meanAnomaly + center + 180 + 102.9372) % 360;
  const solarTransit = 2451545 + n + 0.0053 * Math.sin(meanAnomaly * toRad) - 0.0069 * Math.sin(2 * eclipticLong * toRad);
  const declination = Math.asin(Math.sin(eclipticLong * toRad) * Math.sin(23.44 * toRad));

  // -0.833 degrees accounts for refraction and the solar disc, the standard sunset value.
  const cosHourAngle =
    (Math.sin(-0.833 * toRad) - Math.sin(lat * toRad) * Math.sin(declination)) / (Math.cos(lat * toRad) * Math.cos(declination));
  if (cosHourAngle < -1 || cosHourAngle > 1) return null;

  const hourAngle = Math.acos(cosHourAngle) / toRad;
  const sunsetJulian = solarTransit + hourAngle / 360;
  const sunsetUtcMs = (sunsetJulian - 2440587.5) * 86400000;
  const local = localParts(new Date(sunsetUtcMs), tz);
  return local.hour * 60 + local.minute;
}

export interface OpenState {
  /** null when the hours could not be read: the caller must not claim the park is shut. */
  open: boolean | null;
  /** Local minutes past midnight, for the "opens at" / "closes at" line. */
  opensMin: number | null;
  closesMin: number | null;
}

export interface OpeningPark {
  hours: string | null;
  lat: number;
  lng: number;
  time_zone?: string | null;
}

/**
 * Whether the gate is open at `now`.
 *
 * Returns `open: null` rather than guessing when the hours cannot be read, so an
 * unparseable sentence never produces a false "Closed".
 */
export function getOpenState(park: OpeningPark, now: Date): OpenState {
  const tz = park.time_zone || DEFAULT_TZ;
  const parsed = parseOpeningHours(park.hours);
  if (parsed.alwaysOpen) return { open: true, opensMin: null, closesMin: null };

  const closesMin = parsed.closesAtSunset ? sunsetMinutes(park.lat, park.lng, now, tz) : parsed.closesMin;
  const opensMin = parsed.opensMin;
  if (opensMin === null || closesMin === null) return { open: null, opensMin, closesMin };

  const parts = localParts(now, tz);
  const nowMin = parts.hour * 60 + parts.minute;
  // Closing past midnight is not a pattern these parks use, but guard anyway.
  const open = closesMin > opensMin ? nowMin >= opensMin && nowMin < closesMin : nowMin >= opensMin || nowMin < closesMin;
  return { open, opensMin, closesMin };
}

/** "8:00 AM" from local minutes past midnight. */
export function formatMinutes(min: number): string {
  const h24 = Math.floor(min / 60) % 24;
  const m = min % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}
