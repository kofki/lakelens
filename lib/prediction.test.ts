import { describe, expect, it } from "vitest";
import type { Park, ParkAlert, WeatherPayload } from "./types";
import { getDayContext } from "./holidays";
import { predictClosure, QUIET_WEEKDAY_REASON } from "./prediction";

function makePark(overrides: Partial<Park> = {}): Park {
  return {
    id: "p-ichetucknee",
    slug: "ichetucknee-springs-state-park",
    name: "Ichetucknee Springs State Park",
    type: "spring",
    operator: "state",
    lat: 29.98389,
    lng: -82.76194,
    coverage_tier: "deep",
    swimming_verified: true,
    guarded: "no",
    hours: "8 a.m. to sunset",
    fees: "$6 per vehicle",
    reservation_required: false,
    reservation_url: null,
    rules: {},
    usgs_site_id: "02322700",
    river_gauge_site_id: null,
    gauge_distance_km: null,
    nws_grid: null,
    nws_zone: null,
    nws_county: null,
    typical_closure_time: "10:30",
    cavern_warning: false,
    safety_notes: null,
    official_url: null,
    photo_url: null,
    entrance_notes: null,
    swim_season: null,
    description: null,
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function makeWeather(highF: number, rainProbMax: number, date = "2026-09-05"): WeatherPayload {
  return {
    provider: "nws",
    fetchedAt: "2026-09-05T11:00:00Z",
    current: { tempF: 84, shortForecast: "Sunny", windMph: 5, humidity: 70, icon: null },
    today: { highF, lowF: 72, rainProbMax },
    hourly: [],
    daily: [{ date, name: "Sat", highF, lowF: 72, rainProb: rainProbMax, shortForecast: "Sunny", icon: null }],
  };
}

function makeAlert(overrides: Partial<ParkAlert> = {}): ParkAlert {
  return {
    id: "a1",
    park_id: "p-ichetucknee",
    kind: "closure",
    text: "Swimming area closed until further notice",
    source: "manual",
    official_url: null,
    severity: null,
    starts_at: "2026-07-16T00:00:00Z",
    ends_at: null,
    hash: "h1",
    first_seen: "2026-07-16T00:00:00Z",
    last_seen: "2026-09-05T00:00:00Z",
    active: true,
    last_checked_at: null,
    ...overrides,
  };
}

const LABOR_DAY = [{ date: "2026-09-07", name: "Labor Day" }];

describe("predictClosure", () => {
  it("hot holiday Saturday → likely, time shifted earlier, high confidence", () => {
    const now = new Date("2026-09-05T12:00:00Z"); // Sat 8:00 AM EDT
    const dayContext = getDayContext(now, LABOR_DAY, [], []);
    expect(dayContext.isWeekend).toBe(true);
    expect(dayContext.isHolidayWeekend).toBe(true);

    const p = predictClosure({ park: makePark(), dayContext, weather: makeWeather(94, 10), alerts: [] }, now);
    expect(p.level).toBe("likely");
    expect(p.score).toBe(6); // 3 holiday weekend + 2 weekend + 1 heat
    // 10:30 AM EDT minus (6-2)*25 = 100 min → 8:50 AM EDT = 12:50Z
    expect(p.predictedTime).toBe("2026-09-05T12:50:00.000Z");
    expect(p.predictedTimeLabel).toBe("around 8:50 AM");
    expect(p.confidence).toBe("high");
    expect(p.isEstimate).toBe(true);
    expect(p.reasons).toContain("Holiday weekend (Labor Day)");
    expect(p.reasons).toContain("Forecast high 94°F");
    expect(p.reasons.some((r) => r.startsWith("Usually busiest from 10:30 AM"))).toBe(true);
  });

  it("very hot day adds +3 total for heat", () => {
    const now = new Date("2026-09-12T12:00:00Z"); // plain Saturday
    const dayContext = getDayContext(now, LABOR_DAY, [], []);
    const p = predictClosure({ park: makePark(), dayContext, weather: makeWeather(97, 5, "2026-09-12"), alerts: [] }, now);
    expect(p.score).toBe(5);
    expect(p.level).toBe("likely");
    expect(p.predictedTimeLabel).toBe("around 9:15 AM"); // 75 min earlier
  });

  it("rainy Saturday → none (or possible when also hot); no earlier shift", () => {
    const now = new Date("2026-09-12T12:00:00Z");
    const dayContext = getDayContext(now, LABOR_DAY, [], []);
    expect(dayContext.isHolidayWeekend).toBe(false);

    const rainy = predictClosure({ park: makePark(), dayContext, weather: makeWeather(88, 70, "2026-09-12"), alerts: [] }, now);
    expect(rainy.score).toBe(0);
    expect(rainy.level).toBe("none");
    expect(rainy.predictedTime).toBeNull();
    expect(rainy.reasons).toContain("Rain likely (70%): crowds thin out");

    const rainyHot = predictClosure({ park: makePark(), dayContext, weather: makeWeather(91, 60, "2026-09-12"), alerts: [] }, now);
    expect(rainyHot.score).toBe(1);
    expect(rainyHot.level).toBe("possible");
    expect(rainyHot.predictedTime).toBe("2026-09-12T14:30:00.000Z"); // unshifted 10:30 AM EDT
    expect(rainyHot.predictedTimeLabel).toBe("around 10:30 AM");
  });

  it("plain weekday → none with the quiet-weekday reason", () => {
    const now = new Date("2026-09-16T12:00:00Z"); // Wed
    const dayContext = getDayContext(now, LABOR_DAY, [], []);
    const p = predictClosure({ park: makePark(), dayContext, weather: makeWeather(85, 10, "2026-09-16"), alerts: [] }, now);
    expect(p.level).toBe("none");
    expect(p.score).toBe(0);
    expect(p.predictedTime).toBeNull();
    expect(p.reasons).toContain(QUIET_WEEKDAY_REASON);
  });

  it("college-break weekday → possible via event weight; handles EST (no DST)", () => {
    const now = new Date("2027-03-10T13:00:00Z"); // Wed 8:00 AM EST
    const events = [{ start: "2027-03-06", end: "2027-03-14", name: "UF Spring Break" }];
    const dayContext = getDayContext(now, [], [], events);
    expect(dayContext.events).toEqual(["UF Spring Break"]);
    const p = predictClosure({ park: makePark(), dayContext, weather: makeWeather(80, 0, "2027-03-10"), alerts: [] }, now);
    expect(p.level).toBe("possible");
    expect(p.score).toBe(1);
    expect(p.reasons).toContain("UF Spring Break: extra crowds expected");
    expect(p.reasons).not.toContain(QUIET_WEEKDAY_REASON);
    expect(p.predictedTime).toBe("2027-03-10T15:30:00.000Z"); // 10:30 AM EST
  });

  it("event weight is honoured", () => {
    const now = new Date("2026-09-16T12:00:00Z");
    const events = [{ start: "2026-09-16", end: "2026-09-16", name: "Big festival", weight: 3 }];
    const dayContext = getDayContext(now, [], [], events);
    const p = predictClosure({ park: makePark(), dayContext, weather: null, alerts: [] }, now);
    expect(p.score).toBe(3);
    expect(p.level).toBe("likely");
  });

  it("official closure alert → closed regardless of score", () => {
    const now = new Date("2026-09-05T12:00:00Z");
    const dayContext = getDayContext(now, LABOR_DAY, [], []);
    const p = predictClosure({ park: makePark(), dayContext, weather: makeWeather(94, 10), alerts: [makeAlert()] }, now);
    expect(p.level).toBe("closed");
    expect(p.predictedTime).toBeNull();
    expect(p.reasons[0]).toContain("Official closure");
  });

  it("inactive or expired closure alerts do not close the park", () => {
    const now = new Date("2026-09-05T12:00:00Z");
    const dayContext = getDayContext(now, LABOR_DAY, [], []);
    const inactive = predictClosure({ park: makePark(), dayContext, weather: null, alerts: [makeAlert({ active: false })] }, now);
    expect(inactive.level).toBe("likely");
    const expired = predictClosure({ park: makePark(), dayContext, weather: null, alerts: [makeAlert({ ends_at: "2026-09-01T00:00:00Z" })] }, now);
    expect(expired.level).toBe("likely");
    const notice = predictClosure({ park: makePark(), dayContext, weather: null, alerts: [makeAlert({ kind: "notice" })] }, now);
    expect(notice.level).toBe("likely");
    const future = predictClosure({ park: makePark(), dayContext, weather: null, alerts: [makeAlert({ starts_at: "2026-10-01T00:00:00Z" })] }, now);
    expect(future.level).toBe("likely");
  });

  it("out of swim season → closed with a seasonal reason", () => {
    const blue = makePark({ id: "p-blue", slug: "blue-spring-state-park", swim_season: { open: "04-01", close: "11-14" } });
    const winter = new Date("2026-12-01T15:00:00Z");
    const p = predictClosure({ park: blue, dayContext: getDayContext(winter, [], [], []), weather: null, alerts: [] }, winter);
    expect(p.level).toBe("closed");
    expect(p.reasons[0]).toContain("reopens Apr 1");

    const summer = new Date("2026-09-05T12:00:00Z");
    const q = predictClosure({ park: blue, dayContext: getDayContext(summer, LABOR_DAY, [], []), weather: null, alerts: [] }, summer);
    expect(q.level).toBe("likely");
  });

  it("no typical_closure_time → predictedTime null with explanatory reason; confidence drops", () => {
    const now = new Date("2026-09-05T12:00:00Z");
    const dayContext = getDayContext(now, LABOR_DAY, [], []);
    const p = predictClosure({ park: makePark({ typical_closure_time: null }), dayContext, weather: makeWeather(94, 10), alerts: [] }, now);
    expect(p.level).toBe("likely");
    expect(p.predictedTime).toBeNull();
    expect(p.predictedTimeLabel).toBeNull();
    // A park with no curated busy time says nothing about it rather than admitting a gap.
    expect(p.reasons.some((r) => /don't know|not known|no typical/i.test(r))).toBe(false);
    expect(p.confidence).toBe("medium");
  });

  it("confidence is low when two inputs are missing; basic tier + no weather", () => {
    const now = new Date("2026-09-05T12:00:00Z");
    const dayContext = getDayContext(now, LABOR_DAY, [], []);
    const p = predictClosure({ park: makePark({ coverage_tier: "basic" }), dayContext, weather: null, alerts: [] }, now);
    expect(p.confidence).toBe("low");
    expect(p.reasons).toContain("No forecast available: estimate uses the calendar only");
  });

  it("accepts Postgres time format HH:MM:SS", () => {
    const now = new Date("2026-09-05T12:00:00Z");
    const dayContext = getDayContext(now, LABOR_DAY, [], []);
    const p = predictClosure({ park: makePark({ typical_closure_time: "10:30:00" }), dayContext, weather: makeWeather(94, 10), alerts: [] }, now);
    expect(p.predictedTime).toBe("2026-09-05T12:50:00.000Z");
  });
});
