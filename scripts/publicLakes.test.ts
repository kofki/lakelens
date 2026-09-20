import { describe, expect, it } from "vitest";
import {
  ADJACENCY_M,
  MIN_LAKE_DEG2,
  boxArea,
  boxCentre,
  boxesTouch,
  buildPublicLandQuery,
  lakesNearPublicLand,
  parseBoxes,
  type Box,
} from "./fetch-osm-public-lakes.ts";

/** Roughly Lake Wauburg, and a park whose boundary stops just short of the water. */
const WAUBURG: Box = [29.518, -82.31, 29.534, -82.294];
const PARK_TO_THE_NORTH: Box = [29.535, -82.312, 29.55, -82.29];
const FAR_AWAY: Box = [28.0, -81.0, 28.1, -80.9];

const lake = (name: string, bbox: Box) => ({ name, kind: "lake", bbox });

describe("boxesTouch", () => {
  it("joins a lake to the park that stops just short of it", () => {
    // The whole reason containment failed: park polygons cut their own water out.
    expect(boxesTouch(WAUBURG, PARK_TO_THE_NORTH)).toBe(true);
  });

  it("does not join a lake to public land on the other side of the state", () => {
    expect(boxesTouch(WAUBURG, FAR_AWAY)).toBe(false);
  });

  it("uses a gap small enough to mean 'on the shore'", () => {
    const gapDeg = 900 / 111320; // about 900 m north of the lake
    const tooFar: Box = [WAUBURG[2] + gapDeg, -82.31, WAUBURG[2] + gapDeg + 0.01, -82.294];
    expect(boxesTouch(WAUBURG, tooFar)).toBe(false);
    expect(ADJACENCY_M).toBeLessThan(500);
  });

  it("is symmetric", () => {
    expect(boxesTouch(PARK_TO_THE_NORTH, WAUBURG)).toBe(boxesTouch(WAUBURG, PARK_TO_THE_NORTH));
  });
});

describe("lakesNearPublicLand", () => {
  it("finds a lake whose shore has public land on it", () => {
    const out = lakesNearPublicLand([lake("Lake Wauburg", WAUBURG)], [PARK_TO_THE_NORTH], "FL", new Set());
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "Lake Wauburg", slug: "lake-wauburg-fl", state: "FL", type: "lake" });
  });

  it("pins the lake at its own centre", () => {
    const [park] = lakesNearPublicLand([lake("Lake Wauburg", WAUBURG)], [PARK_TO_THE_NORTH], "FL", new Set());
    expect(park!.lat).toBeCloseTo(29.526, 2);
    expect(park!.lng).toBeCloseTo(-82.302, 2);
  });

  it("drops a retention pond behind a playground", () => {
    const tiny: Box = [29.52, -82.3, 29.5205, -82.2995];
    expect(boxArea(tiny)).toBeLessThan(MIN_LAKE_DEG2);
    expect(lakesNearPublicLand([lake("Detention Pond", tiny)], [PARK_TO_THE_NORTH], "FL", new Set())).toEqual([]);
  });

  it("never claims anyone may swim", () => {
    const [park] = lakesNearPublicLand([lake("Lake Wauburg", WAUBURG)], [PARK_TO_THE_NORTH], "FL", new Set());
    expect(park!.swimming_verified).toBe(false);
    expect(park!.guarded).toBe("unknown");
  });

  it("leaves a lake alone when a beach on it is already in the file", () => {
    const taken = new Set(["lake-wauburg-fl"]);
    expect(lakesNearPublicLand([lake("Lake Wauburg", WAUBURG)], [PARK_TO_THE_NORTH], "FL", taken)).toEqual([]);
  });

  it("ignores rivers and unnamed water", () => {
    const river = { name: "Santa Fe River", kind: "river", bbox: WAUBURG };
    const unnamed = { name: "  ", kind: "lake", bbox: WAUBURG };
    expect(lakesNearPublicLand([river, unnamed], [PARK_TO_THE_NORTH], "FL", new Set())).toEqual([]);
  });
});

describe("the query", () => {
  it("asks for ways and relations of every public-land kind, with boxes", () => {
    const q = buildPublicLandQuery("FL");
    expect(q).toContain('area["ISO3166-2"="US-FL"]');
    expect(q).toContain("out ids tags bb;");
    for (const tag of ["leisure\"=\"park", "nature_reserve", "recreation_ground", "protected_area"]) {
      expect(q, tag).toContain(tag);
    }
    // A big park is a relation; asking only for ways loses the national forests.
    expect(q.match(/relation\[/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("keeps only elements that came back with a box", () => {
    expect(
      parseBoxes([
        { type: "way", id: 1, bounds: { minlat: 1, minlon: 2, maxlat: 3, maxlon: 4 } },
        { type: "node", id: 2 },
      ]),
    ).toEqual([[1, 2, 3, 4]]);
  });
});

describe("boxCentre", () => {
  it("is the middle", () => {
    expect(boxCentre([0, 0, 2, 4])).toEqual({ lat: 1, lng: 2 });
  });
});
