import { describe, expect, it } from "vitest";
import {
  LEVELS,
  MAP_GRID,
  cellKey,
  gridCellDeg,
  levelFromIndex,
  levelIndex,
  parseBbox,
  pointClosed,
  pointCount,
  roundCoord,
  type MapPoint,
} from "./mapPoints";

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

describe("map grid", () => {
  it("sizes cells to the wider side of the viewport", () => {
    expect(gridCellDeg([-128, 24, -64, 50])).toBeCloseTo(1, 5);
    expect(gridCellDeg([-82.5, 29.5, -82.4, 29.6])).toBeCloseTo(0.1 / MAP_GRID, 8);
  });

  it("never lets a street-level zoom shrink the cell to nothing", () => {
    expect(gridCellDeg([-82.4, 29.5, -82.4 + 1e-6, 29.5 + 1e-6])).toBe(1e-4);
  });

  it("keys cells the way map_grid() does, including west of Greenwich", () => {
    // floor, not truncation: -82.3 / 0.5 is -164.6, which is cell -165.
    expect(cellKey(29.6, -82.3, 0.5)).toBe("-165:59");
  });
});

describe("points and cells", () => {
  const park: MapPoint = ["lake-wauburg", "Lake Wauburg", 29.53, -82.3, levelIndex("closed")];
  const cell: MapPoint = ["", "", 28.1, -81.9, levelIndex("unknown"), 212, 3];

  it("counts a park as one and a cell as what it holds", () => {
    expect(pointCount(park)).toBe(1);
    expect(pointCount(cell)).toBe(212);
  });

  it("reads closed from a park's own level and from a cell's tally", () => {
    expect(pointClosed(park)).toBe(1);
    expect(pointClosed(cell)).toBe(3);
  });
});
