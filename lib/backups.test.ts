import { describe, expect, it } from "vitest";
import type { Accessibility, Park, ParkStatus, ParkWithStatus, ParkingLot, StatusLevel } from "./types";
import { DEFAULT_FILTERS } from "./types";
import { EMPTY_SUMMARY } from "./reportStatus";
import { suggestBackups, summarizeParking } from "./backups";
import { driveMinutes, haversineKm } from "./distance";

function makePark(id: string, name: string, lat: number, lng: number, overrides: Partial<Park> = {}): Park {
  return {
    id,
    slug: id,
    name,
    type: "spring",
    operator: "state",
    lat,
    lng,
    coverage_tier: "deep",
    swimming_verified: true,
    guarded: "no",
    hours: null,
    fees: null,
    reservation_required: false,
    reservation_url: null,
    rules: {},
    usgs_site_id: null,
    river_gauge_site_id: null,
    gauge_distance_km: null,
    nws_grid: null,
    nws_zone: null,
    nws_county: null,
    typical_closure_time: null,
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

function status(level: StatusLevel): ParkStatus {
  return { level, source: "prediction", confidence: "medium", reasons: [], updatedAt: null, isEstimate: true, predictedTime: null };
}

function access(park_id: string, overrides: Partial<Accessibility>): Accessibility {
  return {
    park_id,
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

function item(park: Park, level: StatusLevel, accessibility: Accessibility | null = null): ParkWithStatus {
  return {
    park,
    status: status(level),
    prediction: null,
    accessibility,
    usgs: null,
    usgsFetchedAt: null,
    weather: null,
    weatherFetchedAt: null,
    alerts: [],
    reportSummary: EMPTY_SUMMARY,
    distanceKm: null,
  };
}

const ichetucknee = item(makePark("ichetucknee", "Ichetucknee Springs", 29.98389, -82.76194), "full");
const ginnie = item(makePark("ginnie", "Ginnie Springs", 29.83608, -82.70015, { operator: "private", guarded: "no" }), "open", access("ginnie", { water_access: "yes", entry_type: "ramp" }));
const poe = item(makePark("poe", "Poe Springs", 29.82583, -82.64928), "closed");
const gilchrist = item(makePark("gilchrist", "Gilchrist Blue", 29.82972, -82.6829), "closed");
const rainbow = item(makePark("rainbow", "Rainbow Springs", 29.1025, -82.4375), "open", access("rainbow", { water_access: "limited", entry_type: "stairs", wheelchair_loaner: true }));
const deleon = item(makePark("deleon", "De Leon Springs", 29.1413, -81.3706, { coverage_tier: "basic", guarded: "yes" }), "unknown");
const blue = item(makePark("blue", "Blue Spring", 28.94722, -81.33972), "open", access("blue", { water_access: "yes", entry_type: "stairs" }));
const wekiwa = item(makePark("wekiwa", "Wekiwa Springs", 28.7119, -81.4603), "full");

const ALL = [ichetucknee, ginnie, poe, gilchrist, rainbow, deleon, blue, wekiwa];

describe("suggestBackups", () => {
  it("returns nothing when the target is open or unknown", () => {
    expect(suggestBackups(ginnie, ALL, DEFAULT_FILTERS)).toEqual([]);
    expect(suggestBackups(deleon, ALL, DEFAULT_FILTERS)).toEqual([]);
  });

  it("excludes the target and any full/closed park, sorted by distance, max 3", () => {
    const out = suggestBackups(ichetucknee, ALL, DEFAULT_FILTERS);
    expect(out.map((b) => b.park.id)).toEqual(["ginnie", "rainbow", "deleon"]);
    for (let i = 1; i < out.length; i++) expect(out[i].distanceKm).toBeGreaterThanOrEqual(out[i - 1].distanceKm);
    expect(out[0].distanceKm).toBeCloseTo(haversineKm(ichetucknee.park, ginnie.park), 6);
    expect(out[0].driveMinutes).toBe(driveMinutes(out[0].distanceKm));
    expect(out[0].driveMinutes).toBeGreaterThan(0);
  });

  it("honours max", () => {
    expect(suggestBackups(ichetucknee, ALL, DEFAULT_FILTERS, {}, 2).map((b) => b.park.id)).toEqual(["ginnie", "rainbow"]);
    expect(suggestBackups(ichetucknee, ALL, DEFAULT_FILTERS, {}, 10).map((b) => b.park.id)).toEqual(["ginnie", "rainbow", "deleon", "blue"]);
  });

  it("only triggers once a park has actually stopped admitting visitors", () => {
    // Rainbow is open (it may fill later, but you can still get in) → no backups needed.
    expect(suggestBackups(rainbow, ALL, DEFAULT_FILTERS)).toEqual([]);
    // Poe is closed by an official notice → suggest the nearest park with room.
    expect(suggestBackups(poe, ALL, DEFAULT_FILTERS)[0].park.id).toBe("ginnie");
  });

  it("respects the accessible-entry filter", () => {
    const out = suggestBackups(ichetucknee, ALL, { ...DEFAULT_FILTERS, accessibleEntry: true });
    expect(out.map((b) => b.park.id)).toEqual(["ginnie", "rainbow"]); // ramp+yes, wheelchair loaner; stairs and unknown excluded
  });

  it("respects guardedOnly and deepOnly", () => {
    expect(suggestBackups(ichetucknee, ALL, { ...DEFAULT_FILTERS, guardedOnly: true }).map((b) => b.park.id)).toEqual(["deleon"]);
    expect(suggestBackups(ichetucknee, ALL, { ...DEFAULT_FILTERS, deepOnly: true }).map((b) => b.park.id)).toEqual(["ginnie", "rainbow", "blue"]);
  });

  it("builds a parking summary from the main lot", () => {
    const lots: ParkingLot[] = [
      { id: "l2", park_id: "ginnie", name: "Overflow field", lat: 0, lng: 0, fee: null, capacity: null, ada_spaces: null, is_overflow: true, source: "curated", notes: null },
      { id: "l1", park_id: "ginnie", name: "Main lot", lat: 0, lng: 0, fee: "Included with admission", capacity: 300, ada_spaces: 4, is_overflow: false, source: "curated", notes: null },
    ];
    const out = suggestBackups(ichetucknee, ALL, DEFAULT_FILTERS, { ginnie: lots });
    expect(out[0].parkingSummary).toBe("Main lot · Included with admission · 4 ADA spaces · overflow lot available");
    expect(out[1].parkingSummary).toBeNull();
    expect(summarizeParking([])).toBeNull();
    expect(summarizeParking([{ ...lots[1], fee: null, ada_spaces: 1 }])).toBe("Main lot · 1 ADA space");
  });
});
