/**
 * The conversion from OSM opening_hours syntax to the prose lib/openingHours.ts parses.
 *
 * The refusals matter more than the successes here. A converted value feeds a CLOSED badge,
 * so a rule with an exception in it that converts anyway is worse than one that never
 * converts at all: the first tells a visitor the gate is shut, the second says nothing.
 */
import { describe, expect, it } from "vitest";

import { convertOsmHours } from "@/scripts/fetch-osm-park-details";
import { parseOpeningHours } from "@/lib/openingHours";

describe("convertOsmHours", () => {
  it("reads 24/7 as never closing", () => {
    const out = convertOsmHours("24/7");
    expect(out.converted).toBe(true);
    expect(parseOpeningHours(out.text).alwaysOpen).toBe(true);
  });

  it("reads sunrise-sunset as a sundown close with no fixed opening", () => {
    const out = convertOsmHours("sunrise-sunset");
    expect(out.converted).toBe(true);
    const hours = parseOpeningHours(out.text);
    expect(hours.closesAtSunset).toBe(true);
    expect(hours.opensMin).toBeNull();
  });

  it("drops an all-week selector and keeps the range", () => {
    const out = convertOsmHours("Mo-Su 08:00-20:00");
    expect(out).toMatchObject({ text: "8 a.m. to 8 p.m.", converted: true });
    expect(parseOpeningHours(out.text)).toMatchObject({ opensMin: 8 * 60, closesMin: 20 * 60 });
  });

  it("reads a bare clock range, minutes included", () => {
    expect(convertOsmHours("06:30-21:45").text).toBe("6:30 a.m. to 9:45 p.m.");
    expect(parseOpeningHours(convertOsmHours("06:30-21:45").text)).toMatchObject({
      opensMin: 6 * 60 + 30,
      closesMin: 21 * 60 + 45,
    });
  });

  it("always keeps the raw value, converted or not", () => {
    expect(convertOsmHours("Mo-Fr 09:00-17:00").raw).toBe("Mo-Fr 09:00-17:00");
    expect(convertOsmHours("24/7").raw).toBe("24/7");
  });

  it.each([
    // A weekday selector narrower than the week: the weekend is a different answer.
    "Mo-Fr 09:00-17:00",
    // Multiple rules: the second one is an exception the prose cannot carry.
    "Mo-Sa 08:00-20:00; Su 10:00-18:00",
    "Mo-Su 08:00-20:00; PH off",
    // A season, which decides whether the park is open at all.
    "Apr-Oct 08:00-20:00",
    // A conditional comment, always an exception.
    'Mo-Su 08:00-20:00 open "call ahead"',
    // Offsets from the solar times, which the app has no way to apply.
    "sunrise-sunset+30",
    // Midnight at either end: all day or past midnight, and the two do not look different.
    "00:00-24:00",
    "20:00-00:00",
    // Not opening_hours syntax at all. Mappers do type this.
    "dawn till dusk",
    "",
  ])("refuses %j and passes the raw string through", (raw) => {
    const out = convertOsmHours(raw);
    expect(out.converted).toBe(false);
    expect(out.text).toBeNull();
    expect(out.raw).toBe(raw.trim());
  });
});
