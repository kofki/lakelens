import { describe, expect, it } from "vitest";
import type { Park, UsgsPayload, WeatherPayload } from "./types";
import { EMPTY_SUMMARY } from "./reportStatus";
import { describeFlow, describeWaterTemp, describeWeather, reportLine, wmoToText } from "./plainLanguage";

const NOW = new Date("2026-09-19T14:15:00Z");

function makePark(overrides: Partial<Park> = {}): Park {
  return {
    id: "p1",
    slug: "ginnie-springs",
    name: "Ginnie Springs",
    type: "spring",
    operator: "private",
    lat: 29.83608,
    lng: -82.70015,
    coverage_tier: "deep",
    swimming_verified: true,
    guarded: "no",
    hours: null,
    fees: null,
    reservation_required: false,
    reservation_url: null,
    rules: {},
    usgs_site_id: "02322400",
    river_gauge_site_id: "02322500",
    gauge_distance_km: 4.2,
    nws_grid: null,
    nws_zone: null,
    nws_county: null,
    typical_closure_time: null,
    cavern_warning: true,
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

function usgs(overrides: Partial<UsgsPayload> = {}): UsgsPayload {
  return {
    source: "usgs-ogc",
    fetchedAt: "2026-09-19T14:00:00Z",
    readings: [
      { site: "02322700", parameter: "00060", value: 352.4, unit: "ft3/s", time: "2026-09-19T13:45:00Z", stale: false, provisional: true },
      { site: "02322700", parameter: "00010", value: 22.1, unit: "degC", time: "2026-09-19T13:45:00Z", stale: false, provisional: true },
    ],
    flowFlag: "normal",
    flowNote: null,
    ...overrides,
  };
}

describe("plain language", () => {
  it("describeFlow", () => {
    expect(describeFlow(null, makePark())).toEqual({ sentence: "Flow data not available yet", level: "unknown" });
    expect(describeFlow(usgs(), makePark())).toEqual({ sentence: "Flow is normal — about 352 cfs (river gauge 4.2 km away)", level: "normal" });
    const high = describeFlow(usgs({ flowFlag: "high" }), makePark({ gauge_distance_km: null }));
    expect(high.level).toBe("high");
    expect(high.sentence).toBe("Flow is higher than usual — about 352 cfs — expect a stronger current");
    const unknown = describeFlow(usgs({ flowFlag: "unknown", readings: [] }), makePark({ gauge_distance_km: null }));
    expect(unknown.level).toBe("unknown");
  });

  it("describeWaterTemp converts °C and falls back to a labelled typical value", () => {
    expect(describeWaterTemp(usgs(), makePark())).toEqual({ valueF: 72, sentence: "Water is 72°F — cool year-round spring water", typical: false });
    const fallback = describeWaterTemp(usgs({ readings: [] }), makePark());
    expect(fallback).toEqual({ valueF: 72, sentence: "Typically about 72°F year-round (no live reading)", typical: true });
    const lake = describeWaterTemp(null, makePark({ type: "lake" }));
    expect(lake.valueF).toBeNull();
    expect(lake.typical).toBe(false);
    const stale = describeWaterTemp(usgs({ readings: [{ site: "x", parameter: "00010", value: 80, unit: "degF", time: "2026-09-19T01:00:00Z", stale: true, provisional: false }] }), makePark());
    expect(stale.valueF).toBe(80);
    expect(stale.sentence).toContain("more than 6 hours old");
  });

  it("describeWeather / wmoToText", () => {
    expect(describeWeather(null)).toBe("Weather not available yet");
    const w: WeatherPayload = {
      provider: "nws",
      fetchedAt: new Date().toISOString(),
      current: { tempF: 88.4, shortForecast: "Partly Sunny", windMph: 6, humidity: 65, icon: null },
      today: { highF: 94, lowF: 73, rainProbMax: 60 },
      hourly: [],
      daily: [],
    };
    expect(describeWeather(w)).toBe("88°F and partly sunny · high 94°F · 60% chance of rain");
    expect(wmoToText(0)).toBe("Clear sky");
    expect(wmoToText(95)).toBe("Thunderstorms");
    expect(wmoToText(1234)).toBe("Unknown conditions");
  });

  it("reportLine", () => {
    expect(reportLine(EMPTY_SUMMARY, NOW)).toBe("No reports in the last 2 hours");
    const freshestAt = "2026-09-19T13:50:00Z";
    expect(reportLine({ ...EMPTY_SUMMARY, signal: "confirmed", category: "entry", value: "turned_away", count: 3, freshestAt, impliesLevel: "full", confidence: "high" }, NOW)).toBe(
      "Turned away · reported 25 min ago · 3 people confirmed",
    );
    expect(reportLine({ ...EMPTY_SUMMARY, signal: "reported", category: "entry", value: "line", count: 1, freshestAt, impliesLevel: "open", confirmations: 2 }, NOW)).toBe(
      "Line at gate · reported 25 min ago · 2 said still true",
    );
    expect(
      reportLine({ ...EMPTY_SUMMARY, signal: "confirmed", category: "entry", value: "turned_away", count: 3, freshestAt, impliesLevel: null, contradicted: true, sampleCount: 3 }, NOW),
    ).toBe("Turned away · reported 25 min ago · 3 people confirmed · now reported as no longer true · a newer report disagrees · sample data");
    expect(reportLine({ ...EMPTY_SUMMARY, signal: "reported", category: "parking", value: "lot_full", count: 2, freshestAt, impliesLevel: "open", sampleCount: 1 }, NOW)).toContain("includes sample data");
  });
});
