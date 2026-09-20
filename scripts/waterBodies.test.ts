import { describe, expect, it } from "vitest";
import { buildBatchQuery, classify, parseBatch, type WaterProbe } from "./fetch-osm-water-bodies.ts";

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

describe("batch alignment", () => {
  const points = [
    { slug: "a", lat: 1, lng: 2 },
    { slug: "b", lat: 3, lng: 4 },
  ];

  it("asks for every point", () => {
    const q = buildBatchQuery(points);
    expect(q).toContain("around:400,1,2");
    expect(q).toContain("around:400,3,4");
    expect(q.match(/make probe/g)).toHaveLength(2);
  });

  it("never asks for an unnamed waterway, which is what made a single point take minutes", () => {
    const q = buildBatchQuery(points);
    for (const line of q.split("\n").filter((l) => l.includes("waterway"))) {
      expect(line).toContain('["name"]');
    }
  });

  it("keeps a point that matched nothing in its own slot", () => {
    const parsed = parseBatch(
      [
        { tags: { i: "0", lakes: "", rivers: "", names: "", coast: "0", spring: "0" } },
        { tags: { i: "1", lakes: "Devils Lake", rivers: "Messenger Creek", names: "Devils Lake", coast: "0", spring: "0" } },
      ],
      points,
    );
    expect(parsed.get("a")?.lakes).toEqual([]);
    expect(parsed.get("b")).toMatchObject({ lakes: ["Devils Lake"], rivers: ["Messenger Creek"] });
  });

  it("ignores an index that is not in this batch", () => {
    expect(parseBatch([{ tags: { i: "9", names: "Ghost Lake" } }], points).size).toBe(0);
  });
});
