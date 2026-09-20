import { describe, expect, it } from "vitest";
import { MAX_INFERENCE_KM, nearestState } from "./nearestState";

const parks = [
  { state: "FL", lat: 29.98, lng: -82.76 },
  { state: "GA", lat: 32.08, lng: -81.09 },
  { state: "MI", lat: 44.25, lng: -85.4 },
  { state: null, lat: 29.99, lng: -82.77 },
];

describe("nearestState", () => {
  it("picks the state of the closest park", () => {
    expect(nearestState({ lat: 29.9, lng: -82.7 }, parks)).toBe("FL");
    expect(nearestState({ lat: 44.0, lng: -85.0 }, parks)).toBe("MI");
  });

  it("ignores a park with no state rather than returning nothing", () => {
    // The unstated park is fractionally closer than the Florida one.
    expect(nearestState({ lat: 29.99, lng: -82.77 }, parks)).toBe("FL");
  });

  it("gives up rather than guessing from across the country", () => {
    // Honolulu: nearest mainland park is thousands of km away.
    expect(nearestState({ lat: 21.3, lng: -157.8 }, parks)).toBeNull();
  });

  it("has no opinion without a location", () => {
    expect(nearestState(null, parks)).toBeNull();
    expect(nearestState(undefined, parks)).toBeNull();
  });

  it("has no opinion with no parks", () => {
    expect(nearestState({ lat: 29.9, lng: -82.7 }, [])).toBeNull();
  });

  it("uses a range wide enough to cross a state but not a country", () => {
    expect(MAX_INFERENCE_KM).toBeGreaterThan(100);
    expect(MAX_INFERENCE_KM).toBeLessThan(1000);
  });
});
