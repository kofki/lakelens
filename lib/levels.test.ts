import { describe, expect, it } from "vitest";
import {
  feelsLikeLevel,
  humidityLevel,
  rainLevel,
  thunderLevel,
  uvLevel,
  waterQualityLevel,
  waterTempLevel,
  windLevel,
} from "./levels";
import { weatherGlyph } from "./weatherIcon";

describe("level ramps", () => {
  it("uvLevel follows the WHO bands", () => {
    expect(uvLevel(0)?.label).toBe("Low");
    expect(uvLevel(2.9)?.label).toBe("Low");
    expect(uvLevel(3)?.label).toBe("Moderate");
    expect(uvLevel(6)?.label).toBe("High");
    expect(uvLevel(8)?.label).toBe("Very high");
    expect(uvLevel(11)?.label).toBe("Extreme");
  });

  it("uvLevel escalates the tone with the band", () => {
    expect(uvLevel(1)?.tone).toBe("good");
    expect(uvLevel(9)?.tone).toBe("high");
    expect(uvLevel(12)?.tone).toBe("bad");
  });

  it("every ramp returns null rather than inventing a reading", () => {
    for (const fn of [uvLevel, feelsLikeLevel, humidityLevel, windLevel, rainLevel, thunderLevel, waterTempLevel]) {
      expect(fn(null)).toBeNull();
      expect(fn(undefined)).toBeNull();
      expect(fn(Number.NaN)).toBeNull();
    }
    expect(waterQualityLevel(null)).toBeNull();
  });

  it("meters stay inside 0-100 even for absurd inputs", () => {
    for (const level of [uvLevel(40), feelsLikeLevel(200), feelsLikeLevel(-50), windLevel(300), waterTempLevel(-20)]) {
      expect(level!.percent).toBeGreaterThanOrEqual(0);
      expect(level!.percent).toBeLessThanOrEqual(100);
    }
  });

  it("feelsLikeLevel crosses into caution at the NWS threshold", () => {
    expect(feelsLikeLevel(79)?.label).toBe("Comfortable");
    expect(feelsLikeLevel(90)?.label).toBe("Caution");
    expect(feelsLikeLevel(103)?.label).toBe("Extreme caution");
  });

  it("thunderLevel warns well below half, because the rule is to leave at first thunder", () => {
    expect(thunderLevel(10)?.tone).toBe("good");
    expect(thunderLevel(20)?.tone).toBe("warn");
    expect(thunderLevel(40)?.tone).toBe("bad");
  });

  it("spring water reads as cold", () => {
    expect(waterTempLevel(72)?.label).toBe("Cool");
    expect(waterTempLevel(60)?.label).toBe("Cold");
    expect(waterTempLevel(85)?.label).toBe("Warm");
  });

  it("waterQualityLevel carries the label and maps the tone", () => {
    const q = { level: "avoid" as const, label: "Avoid", sampledAt: "2026-09-17T00:00:00Z", distanceKm: 2, location: null, microcystin: null };
    expect(waterQualityLevel(q)).toEqual({ label: "Avoid", tone: "bad", percent: null });
  });
});

describe("weatherGlyph", () => {
  it("prefers the most consequential condition in a combined forecast", () => {
    expect(weatherGlyph("Sunny then Chance Thunderstorms")).toBe("storm");
    expect(weatherGlyph("Mostly Cloudy then Slight Chance Rain Showers")).toBe("rain");
  });

  it("maps the common Florida strings", () => {
    expect(weatherGlyph("Sunny")).toBe("sun");
    expect(weatherGlyph("Partly Sunny")).toBe("cloud-sun");
    expect(weatherGlyph("Mostly Cloudy")).toBe("cloud");
    expect(weatherGlyph("Patchy Fog")).toBe("fog");
  });

  it("falls back to a cloud rather than throwing", () => {
    expect(weatherGlyph(null)).toBe("cloud");
    expect(weatherGlyph("")).toBe("cloud");
    expect(weatherGlyph("Something Unexpected")).toBe("cloud");
  });
});
