import { describe, expect, it } from "vitest";
import { buildBatchQuery, classify, parseBatch, type WaterProbe } from "./fetch-osm-water-bodies.ts";

function probe(over: Partial<WaterProbe> = {}): WaterProbe {
  return { names: [], kinds: [], waterways: [], coastline: false, spring: false, ...over };
}

describe("classify", () => {
  it("keeps a named lake", () => {
    const v = classify(probe({ names: ["Lake Winnebago"], kinds: ["lake"] }));
    expect(v).toMatchObject({ water_body: "Lake Winnebago", type: "lake", great_lake: false });
  });

  it("flags the Great Lakes, which are fresh but read as sea beaches", () => {
    for (const name of ["Lake Michigan", "Lake Superior", "Lake St. Clair", "Lake St Clair"]) {
      expect(classify(probe({ names: [name], kinds: ["lake"] })).great_lake).toBe(true);
    }
    expect(classify(probe({ names: ["Lake Michigamme"], kinds: ["lake"] })).great_lake).toBe(false);
  });

  it("rejects a point that cannot name its water", () => {
    expect(classify(probe()).water_body).toBeNull();
    expect(classify(probe({ names: ["  "] })).water_body).toBeNull();
  });

  it("rejects salt water by name and by tag", () => {
    expect(classify(probe({ names: ["Chesapeake Bay"], kinds: ["lake"] })).water_body).toBeNull();
    expect(classify(probe({ names: ["Mosquito Lagoon"] })).water_body).toBeNull();
    expect(classify(probe({ names: ["Some Water"], kinds: ["salt_pool"] })).water_body).toBeNull();
  });

  it("rejects anything with the sea within range, whatever it is named", () => {
    const v = classify(probe({ names: ["Salt Pond"], kinds: ["lake"], coastline: true }));
    expect(v.water_body).toBeNull();
    expect(v.reason).toMatch(/coastline/);
  });

  it("types a river beach as a river", () => {
    expect(classify(probe({ names: ["Wisconsin River"], waterways: ["river"] })).type).toBe("river");
  });

  it("prefers the lake when a feeder creek is also in range", () => {
    const v = classify(probe({ names: ["Devils Lake"], kinds: ["lake"], waterways: ["stream"] }));
    expect(v.type).toBe("lake");
  });

  it("types a spring only when there is no still water", () => {
    expect(classify(probe({ names: ["Blue Spring"], spring: true })).type).toBe("spring");
    expect(classify(probe({ names: ["Blue Spring Lake"], kinds: ["lake"], spring: true })).type).toBe("lake");
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

  it("keeps a point that matched nothing in its own slot", () => {
    const parsed = parseBatch(
      [
        { tags: { i: "0", names: "", kinds: "", waterways: "", coast: "0", spring: "0" } },
        { tags: { i: "1", names: "Devils Lake", kinds: "lake", waterways: "stream;river", coast: "0", spring: "0" } },
      ],
      points,
    );
    expect(parsed.get("a")?.names).toEqual([]);
    expect(parsed.get("b")?.names).toEqual(["Devils Lake"]);
    expect(parsed.get("b")?.waterways).toEqual(["stream", "river"]);
  });

  it("ignores an index that is not in this batch", () => {
    expect(parseBatch([{ tags: { i: "9", names: "Ghost Lake" } }], points).size).toBe(0);
  });
});
