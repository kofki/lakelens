import { describe, expect, it } from "vitest";
import { lotSummary, parkingBounds } from "./parking";

const lot = (over: Partial<Parameters<typeof lotSummary>[0]> = {}) => ({
  fee: null,
  capacity: null,
  ada_spaces: null,
  is_overflow: false,
  ...over,
});

describe("lotSummary", () => {
  it("says nothing when we know nothing", () => {
    expect(lotSummary(lot())).toBe("");
  });

  it("lists only the facts we have, in a fixed order", () => {
    expect(lotSummary(lot({ fee: "$6 per vehicle", capacity: 120, ada_spaces: 4, is_overflow: true }))).toBe(
      "$6 per vehicle · about 120 spaces · 4 accessible spaces · overflow lot",
    );
    expect(lotSummary(lot({ capacity: 40 }))).toBe("about 40 spaces");
  });

  it("treats zero accessible spaces as nothing to advertise", () => {
    expect(lotSummary(lot({ ada_spaces: 0 }))).toBe("");
    expect(lotSummary(lot({ ada_spaces: 2 }))).toBe("2 accessible spaces");
  });
});

describe("parkingBounds", () => {
  const center = { lat: 29.98, lng: -82.76 };

  it("includes the park even when every lot is on one side of it", () => {
    const b = parkingBounds(center, [
      { lat: 30.0, lng: -82.7 },
      { lat: 30.1, lng: -82.6 },
    ]);
    expect(b).toEqual([
      [-82.76, 29.98],
      [-82.6, 30.1],
    ]);
  });

  it("degenerates to the park itself when there are no lots", () => {
    expect(parkingBounds(center, [])).toEqual([
      [-82.76, 29.98],
      [-82.76, 29.98],
    ]);
  });

  it("spans an offshore park and its mainland lots", () => {
    // Anclote Key: the centroid is open water, the parking is on the mainland.
    const island = { lat: 28.17, lng: -82.84 };
    const b = parkingBounds(island, [{ lat: 28.16, lng: -82.75 }]);
    expect(b[0]).toEqual([-82.84, 28.16]);
    expect(b[1]).toEqual([-82.75, 28.17]);
  });
});
