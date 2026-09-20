import { describe, expect, it } from "vitest";
import { buildIndex, clusterLabel, pinsFor, toFeatureCollection, type ClusterBubble } from "./clusters";
import type { ParkWithStatus } from "@/lib/types";

const park = (id: string, lng: number, lat: number, level = "open") =>
  ({ park: { id, lng, lat }, status: { level } }) as unknown as ParkWithStatus;

/** Ten parks within a few km of each other, and one a long way off. */
const CLUSTER_OF_TEN = Array.from({ length: 10 }, (_, i) => park(`c${i}`, -87.6 + i * 0.002, 41.88 + i * 0.002));
const LONE_PARK = park("lone", -110, 40);
const WHOLE_US: [number, number, number, number] = [-180, 15, -60, 72];

describe("toFeatureCollection", () => {
  it("carries the id and status level onto each point", () => {
    const fc = toFeatureCollection([park("a", -87, 42, "closed")]);
    expect(fc.features[0]).toMatchObject({
      properties: { id: "a", level: "closed" },
      geometry: { coordinates: [-87, 42] },
    });
  });
});

describe("pinsFor", () => {
  const index = buildIndex([...CLUSTER_OF_TEN, LONE_PARK]);

  it("merges neighbours into one bubble when zoomed out", () => {
    const pins = pinsFor(index, WHOLE_US, 3);
    const bubbles = pins.filter((p) => p.kind === "cluster");
    expect(bubbles).toHaveLength(1);
    expect(bubbles[0]).toMatchObject({ count: 10 });
  });

  it("keeps a park with no neighbours as its own pin", () => {
    const pins = pinsFor(index, WHOLE_US, 3);
    expect(pins.filter((p) => p.kind === "park").map((p) => p.kind === "park" && p.parkId)).toContain("lone");
  });

  it("breaks the bubble apart once zoomed in", () => {
    const pins = pinsFor(index, [-87.7, 41.8, -87.5, 42.0], 15);
    expect(pins.every((p) => p.kind === "park")).toBe(true);
    expect(pins).toHaveLength(10);
  });

  it("shows nothing for a viewport with no parks in it", () => {
    expect(pinsFor(index, [10, 10, 11, 11], 8)).toEqual([]);
  });

  it("counts how many parks in a bubble are shut", () => {
    const mixed = buildIndex([
      park("a", -87.6, 41.88, "closed"),
      park("b", -87.601, 41.881, "closed"),
      park("c", -87.602, 41.882, "open"),
    ]);
    const bubble = pinsFor(mixed, WHOLE_US, 3).find((p) => p.kind === "cluster");
    expect(bubble).toMatchObject({ count: 3, closed: 2 });
  });

  it("gives every pin a distinct key, because React needs one", () => {
    const pins = pinsFor(index, WHOLE_US, 3);
    expect(new Set(pins.map((p) => p.key)).size).toBe(pins.length);
  });
});

describe("clusterLabel", () => {
  const bubble = (count: number, closed: number): ClusterBubble =>
    ({ kind: "cluster", clusterId: 1, key: "c1", lng: 0, lat: 0, count, closed });

  it("says nothing about closures when there are none", () => {
    expect(clusterLabel(bubble(12, 0))).toBe("12 swim spots. Zoom in to see them.");
  });

  it("distinguishes some shut from all shut", () => {
    expect(clusterLabel(bubble(12, 3))).toContain("3 shut right now");
    expect(clusterLabel(bubble(12, 12))).toContain("all shut right now");
  });
});
