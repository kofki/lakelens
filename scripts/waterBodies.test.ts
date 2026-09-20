import { describe, expect, it } from "vitest";
import {
  buildStateWaterQuery,
  classify,
  parseWaterFeatures,
  probeFrom,
  type WaterFeature,
  type WaterProbe,
} from "./fetch-osm-water-bodies.ts";

function probe(over: Partial<WaterProbe> = {}): WaterProbe {
  return { lakes: [], rivers: [], names: [], coastline: false, spring: false, ...over };
}

describe("classify", () => {
  it("keeps a named lake", () => {
    const v = classify(probe({ lakes: ["Lake Winnebago"], names: ["Lake Winnebago"] }));
    expect(v).toMatchObject({ water_body: "Lake Winnebago", type: "lake", great_lake: false });
  });

  it("flags the Great Lakes, which are fresh but read as sea beaches", () => {
    for (const name of ["Lake Michigan", "Lake Superior", "Lake St. Clair", "Lake St Clair"]) {
      expect(classify(probe({ lakes: [name] })).great_lake).toBe(true);
    }
    expect(classify(probe({ lakes: ["Lake Michigamme"] })).great_lake).toBe(false);
  });

  it("keeps a lake beach that happens to have a marina next to it", () => {
    // The live shape of a Chicago lakefront beach, which the first version rejected.
    const v = classify(probe({ lakes: ["Lake Michigan"], names: ["Burnham Harbor North Basin", "Lake Michigan"] }));
    expect(v).toMatchObject({ water_body: "Lake Michigan", type: "lake", great_lake: true });
  });

  it("rejects a point that cannot name any water", () => {
    expect(classify(probe()).water_body).toBeNull();
    expect(classify(probe({ names: ["  "] })).water_body).toBeNull();
  });

  it("rejects a point whose only water is salt", () => {
    const v = classify(probe({ names: ["Mosquito Lagoon", "Indian River Bay"] }));
    expect(v.water_body).toBeNull();
    expect(v.reason).toMatch(/no fresh water/);
  });

  it("rejects anything with the sea within range, whatever it is named", () => {
    const v = classify(probe({ lakes: ["Salt Pond"], coastline: true }));
    expect(v.water_body).toBeNull();
    expect(v.reason).toMatch(/coastline/);
  });

  it("types a river beach as a river", () => {
    expect(classify(probe({ rivers: ["Wisconsin River"] }))).toMatchObject({
      water_body: "Wisconsin River",
      type: "river",
    });
  });

  it("prefers the lake when a feeder creek is also in range", () => {
    expect(classify(probe({ lakes: ["Devils Lake"], rivers: ["Messenger Creek"] })).type).toBe("lake");
  });

  it("types a spring only when there is no lake", () => {
    expect(classify(probe({ names: ["Blue Spring"], spring: true })).type).toBe("spring");
    expect(classify(probe({ lakes: ["Blue Spring Lake"], spring: true })).type).toBe("lake");
  });
});

describe("buildStateWaterQuery", () => {
  it("asks for lakes as areas and rivers as ways only", () => {
    const q = buildStateWaterQuery("MI");
    expect(q).toContain('area["ISO3166-2"="US-MI"]');
    expect(q).toContain('nwr["natural"="water"]["name"]["water"~"^(lake|reservoir|pond|oxbow)$"]');
    // A relation for a long river has a box the size of the state, so ways only.
    expect(q).toContain('way["name"]["waterway"~"^(river|stream|canal)$"]');
    expect(q).toContain("out ids tags bb;");
  });
});

describe("parseWaterFeatures", () => {
  it("reads a box from a way and a point from a node", () => {
    const features = parseWaterFeatures([
      { type: "way", id: 1, tags: { name: "Devils Lake", water: "lake" }, bounds: { minlat: 1, minlon: 2, maxlat: 3, maxlon: 4 } },
      { type: "node", id: 2, lat: 5, lon: 6, tags: { name: "Spring Pond", water: "pond" } },
      { type: "way", id: 3, tags: { name: "Rock River", waterway: "river" }, bounds: { minlat: 0, minlon: 0, maxlat: 9, maxlon: 9 } },
    ]);
    expect(features).toEqual([
      { name: "Devils Lake", kind: "lake", bbox: [1, 2, 3, 4] },
      { name: "Spring Pond", kind: "lake", bbox: [5, 6, 5, 6] },
      { name: "Rock River", kind: "river", bbox: [0, 0, 9, 9] },
    ]);
  });

  it("skips anything unnamed or with no position at all", () => {
    expect(parseWaterFeatures([{ type: "way", id: 1, tags: { water: "lake" } }, { type: "way", id: 2, tags: { name: "X" } }])).toEqual([]);
  });
});

describe("probeFrom", () => {
  const big: WaterFeature = { name: "Lake Michigan", kind: "lake", bbox: [41, -88, 46, -85] };
  const small: WaterFeature = { name: "Grant Park Pond", kind: "lake", bbox: [41.87, -87.62, 41.88, -87.61] };
  const river: WaterFeature = { name: "Chicago River", kind: "river", bbox: [41.8, -87.7, 41.9, -87.6] };

  it("puts the smallest containing box first, so a pond beats a Great Lake", () => {
    const probe = probeFrom({ slug: "x", lat: 41.875, lng: -87.615 }, [big, small, river]);
    expect(probe.lakes[0]).toBe("Grant Park Pond");
    expect(probe.lakes).toContain("Lake Michigan");
    expect(probe.rivers).toEqual(["Chicago River"]);
  });

  it("leaves the Great Lake when nothing smaller contains the point", () => {
    expect(probeFrom({ slug: "x", lat: 43, lng: -86.5 }, [big, small, river]).lakes).toEqual(["Lake Michigan"]);
  });

  it("reaches a little past the box, because a beach is on the shore", () => {
    // ~300 m north of the pond's top edge, inside the 600 m pad.
    expect(probeFrom({ slug: "x", lat: 41.8827, lng: -87.615 }, [small]).lakes).toEqual(["Grant Park Pond"]);
    expect(probeFrom({ slug: "x", lat: 41.95, lng: -87.615 }, [small]).lakes).toEqual([]);
  });

  it("finds nothing at all where there is no water", () => {
    expect(probeFrom({ slug: "x", lat: 0, lng: 0 }, [big, small, river])).toMatchObject({ lakes: [], rivers: [], names: [] });
  });
});

describe("coastline", () => {
  const pond: WaterFeature = { name: "Coastal Pond", kind: "lake", bbox: [36.9, -122.05, 36.91, -122.04] };
  const shore = (span: number): WaterFeature => ({
    name: "",
    kind: "coastline",
    bbox: [36.9, -122.05, 36.9 + span, -122.05 + span],
  });
  const point = { slug: "x", lat: 36.905, lng: -122.045 };

  it("is only asked for where there is salt water", () => {
    expect(buildStateWaterQuery("KS")).not.toContain("coastline");
    expect(buildStateWaterQuery("CA", true)).toContain('way["natural"="coastline"]');
  });

  it("reads an unnamed coastline way, which a named-only parse would drop", () => {
    const features = parseWaterFeatures([
      { type: "way", id: 1, tags: { natural: "coastline" }, bounds: { minlat: 1, minlon: 2, maxlat: 3, maxlon: 4 } },
    ]);
    expect(features).toEqual([{ name: "", kind: "coastline", bbox: [1, 2, 3, 4] }]);
  });

  it("rejects a beach where a short coastline way puts the sea right there", () => {
    const probe = probeFrom(point, [pond, shore(0.01)]);
    expect(probe.coastline).toBe(true);
    expect(classify(probe).water_body).toBeNull();
  });

  it("ignores a coastline way whose box spans half a state", () => {
    // Otherwise one long way rejects every inland lake inside its box.
    const probe = probeFrom(point, [pond, shore(2)]);
    expect(probe.coastline).toBe(false);
    expect(classify(probe).water_body).toBe("Coastal Pond");
  });
});
