import { describe, expect, it } from "vitest";
import type { Accessibility } from "./types";
import { driveMinutes, haversineKm, isAccessibleEntry, kmToMiles } from "./distance";

const ICHETUCKNEE = { lat: 29.98389, lng: -82.76194 };
const GINNIE = { lat: 29.83608, lng: -82.70015 };

function access(overrides: Partial<Accessibility>): Accessibility {
  return {
    park_id: "p",
    water_access: "unknown",
    entry_type: "unknown",
    ada_parking: null,
    parking_to_water_m: null,
    accessible_restroom: null,
    surface: "unknown",
    wheelchair_loaner: null,
    handrails: null,
    shade: null,
    depth_at_entry_note: null,
    service_animals_note: null,
    verified: false,
    source: null,
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("distance", () => {
  it("haversine", () => {
    expect(haversineKm(ICHETUCKNEE, ICHETUCKNEE)).toBe(0);
    const km = haversineKm(ICHETUCKNEE, GINNIE);
    expect(km).toBeGreaterThan(16);
    expect(km).toBeLessThan(19);
    expect(haversineKm(GINNIE, ICHETUCKNEE)).toBeCloseTo(km, 9);
  });
  it("units and drive time", () => {
    expect(kmToMiles(1.609344)).toBeCloseTo(1, 9);
    expect(driveMinutes(72.4)).toBe(60);
    expect(driveMinutes(36.2)).toBe(30);
    expect(driveMinutes(0)).toBe(0);
    expect(driveMinutes(100, 60)).toBe(62);
  });
  it("isAccessibleEntry", () => {
    expect(isAccessibleEntry(null)).toBe(false);
    expect(isAccessibleEntry(access({ water_access: "yes", entry_type: "ramp" }))).toBe(true);
    expect(isAccessibleEntry(access({ water_access: "limited", entry_type: "dock_ladder" }))).toBe(true);
    expect(isAccessibleEntry(access({ water_access: "yes", entry_type: "stairs" }))).toBe(false);
    expect(isAccessibleEntry(access({ water_access: "no", entry_type: "ramp" }))).toBe(false);
    expect(isAccessibleEntry(access({ wheelchair_loaner: true }))).toBe(true);
    expect(isAccessibleEntry(access({ wheelchair_loaner: false, water_access: "unknown", entry_type: "unknown" }))).toBe(false);
  });
});
