import { describe, expect, it } from "vitest";
import { cardStatsFor } from "./cardStats";
import type { ParkWithStatus } from "./types";

const item = (over: Record<string, unknown> = {}) =>
  ({
    park: { type: "lake", swim_season: null },
    usgs: null,
    noaa: null,
    weather: null,
    forecast: null,
    ...over,
  }) as unknown as ParkWithStatus;

const forecast = (over: Record<string, unknown>) => ({ forecast: { waterQuality: null, ...over } });

describe("cardStatsFor", () => {
  it("puts water first, because nobody swims in the air", () => {
    const stats = cardStatsFor(
      item({
        ...forecast({ nowTempF: 84, nowUv: 7 }),
        noaa: { readings: [{ parameter: "water_temp", value: 72.4, stale: false }] },
      }),
    );
    expect(stats[0]?.kind).toBe("water");
  });

  it("marks a modelled water temperature with a tilde and a measured one without", () => {
    const measured = cardStatsFor(
      item({ noaa: { readings: [{ parameter: "water_temp", value: 72, stale: false }] } }),
    );
    expect(measured[0]?.value).toBe("72°F");
    expect(measured[0]?.label).toBe("Water");
  });

  it("never claims a reading it does not have", () => {
    expect(cardStatsFor(item())).toEqual([]);
  });

  it("shows at most three, so the strip does not become a dashboard", () => {
    const stats = cardStatsFor(
      item({
        ...forecast({ nowTempF: 84, nowFeelsLikeF: 91, nowUv: 7, waterQuality: { level: "caution", label: "Caution" } }),
        noaa: { readings: [{ parameter: "water_temp", value: 72, stale: false }] },
      }),
    );
    expect(stats).toHaveLength(3);
  });

  it("lets an active advisory take the middle slot from UV", () => {
    const stats = cardStatsFor(
      item({ ...forecast({ nowTempF: 84, nowUv: 9, waterQuality: { level: "avoid", label: "Avoid" } }) }),
    );
    expect(stats.map((s) => s.kind)).toContain("quality");
    expect(stats.map((s) => s.kind)).not.toContain("uv");
  });

  it("keeps UV when the water is clear", () => {
    const stats = cardStatsFor(
      item({ ...forecast({ nowTempF: 84, nowUv: 9, waterQuality: { level: "clear", label: "Clear" } }) }),
    );
    expect(stats.map((s) => s.kind)).toContain("uv");
  });
});
