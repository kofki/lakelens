import { describe, expect, it } from "vitest";
import { isUsableName } from "./fetch-osm-swim-areas.ts";

describe("isUsableName", () => {
  it("keeps a name a reader could act on", () => {
    for (const name of ["Bass Lake Beach", "Ada's Cove", "Île Beach", "Beach E Park"]) {
      expect(isUsableName(name), name).toBe(true);
    }
  });

  it("rejects a campground label mapped as a name", () => {
    // Real rows: OSM carries name=2 on a beach inside a numbered campground.
    for (const name of ["2", "12", "3B", "#4", "A", "", "   "]) {
      expect(isUsableName(name), JSON.stringify(name)).toBe(false);
    }
  });

  it("rejects a name with no word in it", () => {
    expect(isUsableName("-- --")).toBe(false);
  });
});
