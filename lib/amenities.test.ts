import { describe, expect, it } from "vitest";
import { amenityChips } from "./amenities";

describe("amenityChips", () => {
  it("shows a count only when there is more than one", () => {
    const chips = amenityChips({ toilets: 1, shelter: 3 });
    expect(chips.map((c) => c.label)).toEqual(["Restrooms", "Pavilion ×3"]);
  });

  it("does not count linear infrastructure, which OSM splits into segments", () => {
    // One boardwalk can be seventeen pier ways; "Dock x17" would be a mapping artefact
    // dressed up as a fact about the park.
    expect(amenityChips({ pier: 17 })[0].label).toBe("Dock");
    expect(amenityChips({ slipway: 2 })[0].label).toBe("Boat ramp");
  });

  it("drops an implausible count rather than repeating it", () => {
    expect(amenityChips({ toilets: 40 })[0].label).toBe("Restrooms");
    expect(amenityChips({ toilets: 3 })[0].label).toBe("Restrooms \u00d73");
  });

  it("orders by what decides a trip, not by the tag name", () => {
    const chips = amenityChips({ playground: 1, toilets: 1, pier: 1 });
    expect(chips.map((c) => c.kind)).toEqual(["toilets", "pier", "playground"]);
  });

  it("never asserts an absence", () => {
    // An unmapped bathroom and a missing bathroom look identical from OSM, so a kind that
    // is absent or zero produces no chip rather than a "no restrooms" one.
    expect(amenityChips({ toilets: 0 })).toEqual([]);
    expect(amenityChips({})).toEqual([]);
    expect(amenityChips(null)).toEqual([]);
    expect(amenityChips(undefined)).toEqual([]);
  });

  it("carries an icon for every kind it emits", () => {
    const chips = amenityChips({
      toilets: 1, shower: 1, shelter: 1, picnic_table: 1, bbq: 1,
      drinking_water: 1, pier: 1, slipway: 1, boat_rental: 1, cafe: 1, playground: 1,
    });
    expect(chips).toHaveLength(11);
    expect(chips.every((c) => typeof c.icon === "string" && c.icon.length > 0)).toBe(true);
  });
});
