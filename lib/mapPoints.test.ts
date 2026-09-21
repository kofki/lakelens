import { describe, expect, it } from "vitest";
import { LEVELS, MAX_POINTS, levelFromIndex, levelIndex, parseBbox, roundCoord, spreadAcross } from "./mapPoints";

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

describe("spreadAcross", () => {
  const usa: [number, number, number, number] = [-125, 24, -66, 50];

  it("returns everything when it fits", () => {
    const items = [{ lat: 30, lng: -82 }, { lat: 44, lng: -85 }];
    expect(spreadAcross(items, usa, 10)).toHaveLength(2);
  });

  it("keeps the edges of the country, not just the middle", () => {
    // The bug this replaced: nearest-to-centre dropped Florida and Maine from a zoomed-out
    // view, because the centre of the continental US is Kansas.
    const kansas = Array.from({ length: 500 }, (_, i) => ({ lat: 38 + i * 0.001, lng: -98, id: "ks" }));
    const florida = [{ lat: 27, lng: -81, id: "fl" }];
    const maine = [{ lat: 45, lng: -69, id: "me" }];
    const kept = spreadAcross([...kansas, ...florida, ...maine], usa, 50);
    expect(kept.map((i) => i.id)).toContain("fl");
    expect(kept.map((i) => i.id)).toContain("me");
  });

  it("thins the dense places first", () => {
    const dense = Array.from({ length: 300 }, () => ({ lat: 38, lng: -98, id: "dense" }));
    const sparse = Array.from({ length: 5 }, (_, i) => ({ lat: 30 + i, lng: -75, id: "sparse" }));
    const kept = spreadAcross([...dense, ...sparse], usa, 20);
    expect(kept.filter((i) => i.id === "sparse").length).toBeGreaterThan(0);
    expect(kept.filter((i) => i.id === "dense").length).toBeLessThan(300);
  });

  it("honours the limit", () => {
    const many = Array.from({ length: 2000 }, (_, i) => ({ lat: 25 + (i % 200) * 0.12, lng: -124 + (i % 300) * 0.19 }));
    expect(spreadAcross(many, usa, 400)).toHaveLength(400);
  });

  it("does not mutate what it was given", () => {
    const items = [{ lat: 30, lng: -82 }, { lat: 44, lng: -85 }];
    const copy = [...items];
    spreadAcross(items, usa, 1);
    expect(items).toEqual(copy);
  });

  it("caps at a number a map can actually draw", () => {
    expect(MAX_POINTS).toBeLessThanOrEqual(500);
  });
});
