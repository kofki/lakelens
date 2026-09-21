import { describe, expect, it } from "vitest";
import { MAX_KM, cleanPlaceName, nearestPlace, parseGazetteer } from "./assign-places.ts";

const TSV = [
  "USPS\tGEOID\tANSICODE\tNAME\tLSAD\tFUNCSTAT\tALAND\tAWATER\tALAND_SQMI\tAWATER_SQMI\tINTPTLAT\tINTPTLONG",
  "FL\t1225175\t02404339\tGainesville city\t25\tA\t160000\t2000\t62\t0.8\t29.675000\t-82.353000",
  "FL\t1239425\t02404766\tMicanopy town\t43\tA\t5000\t100\t2\t0.04\t29.505000\t-82.280000",
  "GA\t1319000\t02405168\tAtlanta city\t25\tA\t1\t1\t1\t1\t33.762900\t-84.422200",
].join("\n");

describe("parseGazetteer", () => {
  it("reads the columns it needs and drops the type suffix", () => {
    const places = parseGazetteer(TSV);
    expect(places).toHaveLength(3);
    expect(places[0]).toMatchObject({ name: "Gainesville", state: "FL", lat: 29.675 });
    expect(places[1]!.name).toBe("Micanopy");
  });

  it("skips the header and any short line", () => {
    expect(parseGazetteer("USPS\tGEOID\nFL\tbroken")).toEqual([]);
  });
});

describe("cleanPlaceName", () => {
  it("strips the classification, not the name", () => {
    expect(cleanPlaceName("Abanda CDP")).toBe("Abanda");
    expect(cleanPlaceName("Lake Placid village")).toBe("Lake Placid");
    // The trap: stripping twice leaves "Lake".
    expect(cleanPlaceName("Lake City city")).toBe("Lake City");
    // One suffix only: the county half of the name is the name.
    expect(cleanPlaceName("Athens-Clarke County unified government")).toBe("Athens-Clarke County");
  });

  it("leaves a plain name alone", () => {
    expect(cleanPlaceName("Micanopy")).toBe("Micanopy");
  });
});

describe("nearestPlace", () => {
  const byState = new Map<string, ReturnType<typeof parseGazetteer>>();
  for (const p of parseGazetteer(TSV)) {
    const list = byState.get(p.state) ?? [];
    list.push(p);
    byState.set(p.state, list);
  }

  it("names the town a rural lake is actually near", () => {
    // Lake Wauburg: closer to Micanopy than to Gainesville.
    expect(nearestPlace({ lat: 29.5304, lng: -82.3024, state: "FL" }, byState)).toEqual({
      city: "Micanopy",
      state: "FL",
    });
  });

  it("stays inside the park's own state", () => {
    // Physically nearer Atlanta, but a Florida park is described by a Florida town.
    const out = nearestPlace({ lat: 30.9, lng: -83.5, state: "FL" }, byState);
    expect(out.city).not.toBe("Atlanta");
  });

  it("gives up rather than claiming a town an hour away", () => {
    const out = nearestPlace({ lat: 25.5, lng: -81.0, state: "FL" }, byState);
    expect(out).toEqual({ city: null, state: "FL" });
  });

  it("has no opinion without a state", () => {
    expect(nearestPlace({ lat: 29.6, lng: -82.3, state: null }, byState)).toEqual({ city: null, state: null });
  });

  it("uses a radius that means 'near', not 'in the same region'", () => {
    expect(MAX_KM).toBeLessThanOrEqual(50);
  });
});
