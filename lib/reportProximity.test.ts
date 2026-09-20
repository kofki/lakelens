import { describe, expect, it } from "vitest";
import { classifyOrigin, originLabel, originWeight, ON_SITE_KM } from "./reportProximity";

// Ichetucknee Springs, and points at known distances from it.
const park = { lat: 29.9841, lng: -82.7612 };
const at = (km: number) => ({ lat: park.lat + km / 111.32, lng: park.lng });

describe("classifyOrigin", () => {
  it("treats the park itself as on site", () => {
    expect(classifyOrigin(park, park)).toMatchObject({ origin: "on_site", onSite: true });
    expect(classifyOrigin(at(1), park).origin).toBe("on_site");
  });

  it("allows for a park being bigger than its coordinate", () => {
    // The overflow lot people report on is at the far edge of the lake, not at our pin.
    expect(classifyOrigin(at(ON_SITE_KM - 0.1), park).origin).toBe("on_site");
    expect(classifyOrigin(at(ON_SITE_KM + 1), park).origin).toBe("nearby");
  });

  it("separates nearby, in state and far away", () => {
    expect(classifyOrigin(at(10), park).origin).toBe("nearby");
    expect(classifyOrigin(at(100), park).origin).toBe("in_state");
    expect(classifyOrigin(at(900), park).origin).toBe("remote");
  });

  it("accepts a report with no location rather than refusing it", () => {
    const v = classifyOrigin(null, park);
    expect(v).toMatchObject({ origin: "unplaced", distanceKm: null, onSite: false });
    expect(originWeight("unplaced")).toBeGreaterThan(0);
  });

  it("refuses null island and other broken coordinates", () => {
    for (const bad of [{ lat: 0, lng: 0 }, { lat: NaN, lng: 1 }, { lat: 1, lng: Infinity }]) {
      expect(classifyOrigin(bad, park).origin).toBe("unplaced");
    }
  });

  it("reports the distance it used, so the decision can be checked", () => {
    const v = classifyOrigin(at(10), park);
    expect(v.distanceKm).toBeGreaterThan(9);
    expect(v.distanceKm).toBeLessThan(11);
  });
});

describe("originWeight", () => {
  it("lets someone standing there outweigh someone who is not", () => {
    expect(originWeight("on_site")).toBeGreaterThan(originWeight("nearby"));
    expect(originWeight("nearby")).toBeGreaterThan(originWeight("unplaced"));
    expect(originWeight("unplaced")).toBeGreaterThan(originWeight("in_state"));
    expect(originWeight("in_state")).toBeGreaterThan(originWeight("remote"));
  });

  it("never discards a report entirely", () => {
    for (const o of ["on_site", "nearby", "unplaced", "in_state", "remote"] as const) {
      expect(originWeight(o)).toBeGreaterThan(0);
    }
  });
});

describe("originLabel", () => {
  it("says something only when there is something to say", () => {
    expect(originLabel("on_site")).toBe("At the park");
    expect(originLabel("remote")).toBe("Far away");
    expect(originLabel("unplaced")).toBeNull();
    expect(originLabel("in_state")).toBeNull();
  });
});
