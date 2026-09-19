import { describe, expect, it } from "vitest";
import { getDayContext, holidayWindow, shiftDateKey, weekdayOfKey } from "./holidays";

const HOLIDAYS = [
  { date: "2026-09-07", name: "Labor Day" },
  { date: "2026-11-26", name: "Thanksgiving Day" },
  { date: "2026-07-03", name: "Independence Day" },
];
const LONG_WEEKENDS = [{ start_date: "2026-09-05", end_date: "2026-09-07" }];

describe("getDayContext", () => {
  it("plain weekday", () => {
    const ctx = getDayContext(new Date("2026-09-16T12:00:00Z"), HOLIDAYS, LONG_WEEKENDS, []);
    expect(ctx).toEqual({
      date: "2026-09-16",
      isWeekend: false,
      isHoliday: false,
      holidayName: null,
      isHolidayWeekend: false,
      events: [],
      eventWeight: 0,
    });
  });

  it("weekend (Saturday and Sunday)", () => {
    expect(getDayContext(new Date("2026-09-12T12:00:00Z"), [], [], []).isWeekend).toBe(true);
    expect(getDayContext(new Date("2026-09-13T12:00:00Z"), [], [], []).isWeekend).toBe(true);
    expect(getDayContext(new Date("2026-09-14T12:00:00Z"), [], [], []).isWeekend).toBe(false);
  });

  it("holiday itself (Labor Day Monday)", () => {
    const ctx = getDayContext(new Date("2026-09-07T12:00:00Z"), HOLIDAYS, LONG_WEEKENDS, []);
    expect(ctx.isHoliday).toBe(true);
    expect(ctx.holidayName).toBe("Labor Day");
    expect(ctx.isWeekend).toBe(false);
    expect(ctx.isHolidayWeekend).toBe(true);
  });

  it("long weekend from the explicit list", () => {
    const ctx = getDayContext(new Date("2026-09-05T12:00:00Z"), HOLIDAYS, LONG_WEEKENDS, []);
    expect(ctx.isHoliday).toBe(false);
    expect(ctx.isHolidayWeekend).toBe(true);
    expect(ctx.holidayName).toBe("Labor Day");
  });

  it("long weekend derived from the holiday weekday when the list is empty", () => {
    const sat = getDayContext(new Date("2026-09-05T12:00:00Z"), HOLIDAYS, [], []);
    expect(sat.isHolidayWeekend).toBe(true);
    expect(sat.holidayName).toBe("Labor Day");
    const friAfterThanksgiving = getDayContext(new Date("2026-11-27T15:00:00Z"), HOLIDAYS, [], []);
    expect(friAfterThanksgiving.isHolidayWeekend).toBe(true);
    expect(friAfterThanksgiving.holidayName).toBe("Thanksgiving Day");
    const sunAfterJuly3 = getDayContext(new Date("2026-07-05T15:00:00Z"), HOLIDAYS, [], []);
    expect(sunAfterJuly3.isHolidayWeekend).toBe(true);
    const tueAfterLaborDay = getDayContext(new Date("2026-09-08T12:00:00Z"), HOLIDAYS, [], []);
    expect(tueAfterLaborDay.isHolidayWeekend).toBe(false);
  });

  it("uses America/New_York for the local date (late-night UTC is still the previous local day)", () => {
    const ctx = getDayContext(new Date("2026-09-06T02:30:00Z"), HOLIDAYS, [], []); // Sat 10:30 PM EDT
    expect(ctx.date).toBe("2026-09-05");
    expect(ctx.isWeekend).toBe(true);
    const chicago = getDayContext(new Date("2026-09-06T04:30:00Z"), [], [], [], "America/Chicago");
    expect(chicago.date).toBe("2026-09-05");
  });

  it("events with default and explicit weights", () => {
    const events = [
      { start: "2026-09-19", end: "2026-09-19", name: "UF vs. Tennessee (home)" },
      { start: "2026-09-14", end: "2026-09-20", name: "Homecoming week", weight: 0.5 },
      { start: "2026-10-01", end: "2026-10-02", name: "Not this week" },
    ];
    const ctx = getDayContext(new Date("2026-09-19T14:00:00Z"), [], [], events);
    expect(ctx.events).toEqual(["UF vs. Tennessee (home)", "Homecoming week"]);
    expect(ctx.eventWeight).toBe(1.5);
  });

  it("date helpers", () => {
    expect(shiftDateKey("2026-09-05", 2)).toBe("2026-09-07");
    expect(shiftDateKey("2026-01-01", -1)).toBe("2025-12-31");
    expect(weekdayOfKey("2026-09-07")).toBe(1);
    expect(holidayWindow({ date: "2026-09-07", name: "Labor Day" })).toEqual({ start: "2026-09-05", end: "2026-09-07" });
    expect(holidayWindow({ date: "2026-11-26", name: "Thanksgiving" })).toEqual({ start: "2026-11-26", end: "2026-11-29" });
    expect(holidayWindow({ date: "2026-12-25", name: "Christmas (Fri)" })).toEqual({ start: "2026-12-25", end: "2026-12-27" });
    expect(holidayWindow({ date: "2026-06-17", name: "Wednesday holiday" })).toBeNull();
  });
});
