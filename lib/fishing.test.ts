import { describe, expect, it } from "vitest";
import { fishingAgency, mentionsFishing } from "./fishing";

describe("fishingAgency", () => {
  it("returns the state's own agency", () => {
    expect(fishingAgency("MN")?.agency).toBe("Minnesota Department of Natural Resources");
    expect(fishingAgency("mi")?.agency).toContain("Michigan");
  });

  it("returns nothing for a state we have not checked, rather than guessing", () => {
    // Sending an angler to the wrong agency is worse than sending them to a search engine.
    expect(fishingAgency("TX")).toBeNull();
    expect(fishingAgency(null)).toBeNull();
    expect(fishingAgency("")).toBeNull();
  });

  it("links to regulations and to a licence separately, because they are different pages", () => {
    const mn = fishingAgency("MN")!;
    expect(mn.regulationsUrl).not.toBe(mn.licenceUrl);
    for (const a of ["FL", "MI", "MN", "WI"].map((s) => fishingAgency(s)!)) {
      expect(a.regulationsUrl).toMatch(/^https:\/\//);
      expect(a.licenceUrl).toMatch(/^https:\/\//);
    }
  });
});

describe("mentionsFishing", () => {
  it("is for lakes and rivers", () => {
    expect(mentionsFishing({ type: "lake", state: "MN" })).toBe(true);
    expect(mentionsFishing({ type: "river", state: "FL" })).toBe(true);
  });

  it("leaves springs alone, since they are swim holes rather than fisheries", () => {
    expect(mentionsFishing({ type: "spring", state: "FL" })).toBe(false);
  });

  it("stays quiet where we have no agency for the state", () => {
    expect(mentionsFishing({ type: "lake", state: "TX" })).toBe(false);
    expect(mentionsFishing({ type: "lake", state: null })).toBe(false);
  });
});
