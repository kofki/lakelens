import { describe, expect, it } from "vitest";
import { STATUS_META, statusDescription, statusIconName, statusShortReason } from "./status";

const closed = (source: "alert" | "hours" | "seasonal") => ({ level: "closed" as const, source });

describe("closed is not one thing", () => {
  it("shows a different glyph for each kind of closure", () => {
    // All three shared one stop sign, so on the map a park shut for the night looked
    // exactly like one an official notice had closed.
    expect(statusIconName(closed("hours"))).toBe("Moon");
    expect(statusIconName(closed("seasonal"))).toBe("CalendarOff");
    expect(statusIconName(closed("alert"))).toBe(STATUS_META.closed.icon);
  });

  it("names each kind, so a glyph is never the only clue", () => {
    expect(statusShortReason(closed("hours"))).toBe("Closed for the night");
    expect(statusShortReason(closed("seasonal"))).toBe("Closed for the season");
    expect(statusShortReason(closed("alert"))).toBe(STATUS_META.closed.label);
  });

  it("does not claim an official notice when the gate is simply shut overnight", () => {
    expect(statusDescription(closed("hours"))).toBe("Outside the park's opening hours.");
    expect(statusDescription(closed("seasonal"))).toBe("Closed for the season.");
    expect(statusDescription(closed("alert"))).toBe(STATUS_META.closed.description);
  });

  it("leaves every other level alone", () => {
    for (const level of ["open", "full", "unknown"] as const) {
      expect(statusIconName({ level, source: "hours" })).toBe(STATUS_META[level].icon);
      expect(statusShortReason({ level, source: "hours" })).toBe(STATUS_META[level].label);
      expect(statusDescription({ level, source: "hours" })).toBe(STATUS_META[level].description);
    }
  });
});
