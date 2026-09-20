import { describe, expect, it } from "vitest";
import { clusterLabel, readPins, toFeatureCollection, type ClusterBubble } from "./clusters";
import type { ParkWithStatus } from "@/lib/types";

const park = (id: string, lng: number, lat: number, level = "open") =>
  ({ park: { id, lng, lat }, status: { level } }) as unknown as ParkWithStatus;

const cluster = (id: number, count: number, closed = 0, lng = -87, lat = 42) => ({
  properties: { cluster: true, cluster_id: id, point_count: count, closed },
  geometry: { type: "Point", coordinates: [lng, lat] },
});

describe("toFeatureCollection", () => {
  it("carries the id and status level onto each point", () => {
    const fc = toFeatureCollection([park("a", -87, 42, "closed")]);
    expect(fc.features[0]).toMatchObject({
      properties: { id: "a", level: "closed" },
      geometry: { coordinates: [-87, 42] },
    });
  });
});

describe("readPins", () => {
  it("separates bubbles from single pins", () => {
    const pins = readPins([cluster(7, 12, 3), { properties: { id: "a" }, geometry: { type: "Point", coordinates: [-87, 42] } }]);
    expect(pins).toHaveLength(2);
    expect(pins.find((p) => p.kind === "cluster")).toMatchObject({ clusterId: 7, count: 12, closed: 3 });
    expect(pins.find((p) => p.kind === "park")).toMatchObject({ parkId: "a" });
  });

  it("deduplicates a feature returned once per tile it touches", () => {
    const single = { properties: { id: "a" }, geometry: { type: "Point", coordinates: [-87, 42] } };
    expect(readPins([cluster(7, 12), cluster(7, 12), single, single])).toHaveLength(2);
  });

  it("drops a feature with no id and a cluster with no coordinates", () => {
    expect(readPins([{ properties: {} }])).toEqual([]);
    expect(readPins([{ properties: { cluster: true, cluster_id: 1, point_count: 5 }, geometry: null }])).toEqual([]);
  });

  it("survives a null properties bag", () => {
    expect(() => readPins([{ properties: null, geometry: null }])).not.toThrow();
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
