import { describe, expect, it } from "vitest";
import { LEVELS, MAX_POINTS, levelFromIndex, levelIndex, nearestToCentre, parseBbox, roundCoord } from "./mapPoints";

describe("levels round-trip", () => {
  it("survives the trip through an index", () => {
    for (const level of LEVELS) expect(levelFromIndex(levelIndex(level))).toBe(level);
  });

  it("falls back to unknown rather than throwing on a bad index", () => {
    expect(levelFromIndex(99)).toBe("unknown");
    expect(levelFromIndex(-1)).toBe("unknown");
  });
});

describe("roundCoord", () => {
  it("keeps about a metre and drops the noise", () => {
    expect(roundCoord(29.5303712345)).toBe(29.53037);
    expect(String(roundCoord(-82.302441111)).length).toBeLessThanOrEqual(10);
  });
});

describe("parseBbox", () => {
  it("reads a viewport", () => {
    expect(parseBbox("-82.4,29.4,-82.1,29.7")).toEqual([-82.4, 29.4, -82.1, 29.7]);
  });

  it("refuses anything that is not a viewport", () => {
    for (const bad of [null, "", "1,2,3", "a,b,c,d", "1,2,3,4,5"]) {
      expect(parseBbox(bad), String(bad)).toBeNull();
    }
  });

  it("refuses a box with no area, which returns nothing useful", () => {
    expect(parseBbox("-82,29,-82,30")).toBeNull();
    expect(parseBbox("-82,30,-81,29")).toBeNull();
  });
});

describe("nearestToCentre", () => {
  const bbox: [number, number, number, number] = [-10, -10, 10, 10];

  it("returns everything when it fits", () => {
    const items = [{ lat: 0, lng: 0 }, { lat: 5, lng: 5 }];
    expect(nearestToCentre(items, bbox, 10)).toHaveLength(2);
  });

  it("keeps the middle of the viewport when it does not", () => {
    const items = [
      { lat: 9, lng: 9, id: "corner" },
      { lat: 0, lng: 0, id: "centre" },
      { lat: 4, lng: 4, id: "near" },
    ];
    expect(nearestToCentre(items, bbox, 2).map((i) => i.id)).toEqual(["centre", "near"]);
  });

  it("does not mutate what it was given", () => {
    const items = [{ lat: 9, lng: 9 }, { lat: 0, lng: 0 }];
    const copy = [...items];
    nearestToCentre(items, bbox, 1);
    expect(items).toEqual(copy);
  });

  it("caps at a number a map can actually draw", () => {
    expect(MAX_POINTS).toBeLessThanOrEqual(500);
  });
});
