import { describe, expect, it } from "vitest";
import { isStateCode, normalizeStateCode, stateName } from "./states";

describe("stateName", () => {
  it("maps the codes the current data uses", () => {
    expect(stateName("MI")).toBe("Michigan");
    expect(stateName("WI")).toBe("Wisconsin");
    expect(stateName("MN")).toBe("Minnesota");
    expect(stateName("IL")).toBe("Illinois");
    expect(stateName("OH")).toBe("Ohio");
    expect(stateName("IN")).toBe("Indiana");
    expect(stateName("FL")).toBe("Florida");
  });

  it("covers DC and the far corners", () => {
    expect(stateName("DC")).toBe("District of Columbia");
    expect(stateName("AK")).toBe("Alaska");
    expect(stateName("HI")).toBe("Hawaii");
  });

  it("tolerates casing and padding from the seed data", () => {
    expect(stateName(" mi ")).toBe("Michigan");
  });

  it("returns null rather than a placeholder", () => {
    expect(stateName(null)).toBeNull();
    expect(stateName(undefined)).toBeNull();
    expect(stateName("")).toBeNull();
    expect(stateName("ZZ")).toBeNull();
    expect(stateName("PR")).toBeNull();
  });
});

describe("normalizeStateCode", () => {
  it("upper-cases known codes and rejects the rest", () => {
    expect(normalizeStateCode("wi")).toBe("WI");
    expect(normalizeStateCode("XX")).toBeNull();
    expect(normalizeStateCode(null)).toBeNull();
  });
});

describe("isStateCode", () => {
  it("guards unknown values", () => {
    expect(isStateCode("OH")).toBe(true);
    expect(isStateCode("OHIO")).toBe(false);
    expect(isStateCode(7)).toBe(false);
  });
});
