import { describe, expect, it } from "vitest";
import { formatMinutes, getOpenState, parseOpeningHours, sunsetMinutes } from "./openingHours";

const ICHETUCKNEE = { lat: 29.9841, lng: -82.7612, time_zone: "America/New_York" };

describe("parseOpeningHours", () => {
  it("reads the dominant pattern", () => {
    expect(parseOpeningHours("8 a.m. to sundown, 365 days a year.")).toMatchObject({
      opensMin: 8 * 60,
      closesAtSunset: true,
      closesMin: null,
    });
    expect(parseOpeningHours("8 a.m. until sunset, seven days a week. Day use only.")).toMatchObject({
      opensMin: 480,
      closesAtSunset: true,
    });
  });

  it("reads an explicit pair", () => {
    expect(parseOpeningHours("April - October: 9 a.m. to 7 p.m. November - March: 9 a.m. to 5 p.m.")).toMatchObject({
      opensMin: 9 * 60,
      closesMin: 19 * 60,
      closesAtSunset: false,
    });
  });

  it("only reads the first sentence, so concessions and swim slots are not the park's hours", () => {
    const h = parseOpeningHours(
      "8 a.m. to 7 p.m. daily in spring and summer; 8 a.m. to 6 p.m. in fall and winter. Swimming runs 9 a.m. to 1 p.m. and 2 p.m. to 6 p.m.",
    );
    expect(h.opensMin).toBe(480);
    // The widest range in the FIRST sentence: spans both seasons, ignores the swim slots.
    expect(h.closesMin).toBe(19 * 60);
  });

  it("recognises a park that never closes", () => {
    expect(parseOpeningHours("Daylight hours. There is no gate and no staff.").alwaysOpen).toBe(true);
  });

  it("gives up rather than guessing", () => {
    expect(parseOpeningHours(null)).toMatchObject({ opensMin: null, closesMin: null, closesAtSunset: false });
    expect(parseOpeningHours("Call ahead.")).toMatchObject({ opensMin: null, closesMin: null });
    // One time alone is not a range.
    expect(parseOpeningHours("Gates lock at 5 p.m.")).toMatchObject({ opensMin: null, closesMin: null });
  });
});

describe("sunsetMinutes", () => {
  it("lands within a few minutes of the real Florida sunset", () => {
    // 2026-09-20 at Ichetucknee: sunset is about 7:30 PM Eastern.
    const min = sunsetMinutes(29.9841, -82.7612, new Date("2026-09-20T16:00:00Z"), "America/New_York");
    expect(min).not.toBeNull();
    expect(min!).toBeGreaterThan(19 * 60);
    expect(min!).toBeLessThan(19 * 60 + 45);
  });

  it("moves earlier in winter and later in summer", () => {
    const june = sunsetMinutes(29.98, -82.76, new Date("2026-06-21T16:00:00Z"), "America/New_York")!;
    const december = sunsetMinutes(29.98, -82.76, new Date("2026-12-21T16:00:00Z"), "America/New_York")!;
    expect(june).toBeGreaterThan(december + 90);
  });

  it("returns null for nonsense coordinates", () => {
    expect(sunsetMinutes(Number.NaN, -82, new Date(), "America/New_York")).toBeNull();
  });
});

describe("getOpenState", () => {
  const park = { ...ICHETUCKNEE, hours: "8 a.m. to sundown, 365 days a year." };

  it("is closed at 2 a.m., which is the bug this exists to fix", () => {
    // 06:00 UTC on 2026-09-20 is 02:00 Eastern.
    const state = getOpenState(park, new Date("2026-09-20T06:00:00Z"));
    expect(state.open).toBe(false);
    expect(state.opensMin).toBe(8 * 60);
  });

  it("is open at midday", () => {
    expect(getOpenState(park, new Date("2026-09-20T16:00:00Z")).open).toBe(true);
  });

  it("is closed just after sunset", () => {
    // 01:00 UTC is 21:00 Eastern the previous evening, well past a 19:30 sunset.
    expect(getOpenState(park, new Date("2026-09-21T01:00:00Z")).open).toBe(false);
  });

  it("respects the park's own time zone", () => {
    const central = { ...park, lng: -85.4, time_zone: "America/Chicago" };
    // 13:30 UTC is 08:30 Central (open) but 09:30 Eastern; both open, so use a boundary.
    // 13:30 UTC = 07:30 Central: before opening.
    expect(getOpenState(central, new Date("2026-09-20T12:30:00Z")).open).toBe(false);
    expect(getOpenState({ ...central, time_zone: "America/New_York" }, new Date("2026-09-20T12:30:00Z")).open).toBe(true);
  });

  it("says nothing rather than claiming a closure it cannot support", () => {
    expect(getOpenState({ ...ICHETUCKNEE, hours: "Call ahead." }, new Date()).open).toBeNull();
    expect(getOpenState({ ...ICHETUCKNEE, hours: null }, new Date()).open).toBeNull();
  });

  it("treats a gateless site as always open", () => {
    expect(getOpenState({ ...ICHETUCKNEE, hours: "Daylight hours. There is no gate." }, new Date()).open).toBe(true);
  });
});

describe("formatMinutes", () => {
  it("formats a 12-hour clock", () => {
    expect(formatMinutes(0)).toBe("12:00 AM");
    expect(formatMinutes(8 * 60)).toBe("8:00 AM");
    expect(formatMinutes(12 * 60)).toBe("12:00 PM");
    expect(formatMinutes(19 * 60 + 32)).toBe("7:32 PM");
  });
});
