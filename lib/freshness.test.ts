import { describe, expect, it } from "vitest";
import {
  STALE,
  formatClock,
  formatLocalDate,
  formatLocalTime,
  isStale,
  localParts,
  relativeTime,
  tzOffsetMs,
  zonedTimeToUtc,
} from "./freshness";

const NOW = new Date("2026-09-19T14:15:00Z"); // Sat 10:15 AM EDT

describe("isStale", () => {
  it("treats missing or invalid timestamps as stale", () => {
    expect(isStale(null, STALE.usgs, NOW)).toBe(true);
    expect(isStale("not a date", STALE.usgs, NOW)).toBe(true);
  });
  it("compares against the source threshold", () => {
    expect(isStale("2026-09-19T09:00:00Z", STALE.usgs, NOW)).toBe(false); // 5h15 < 6h
    expect(isStale("2026-09-19T08:00:00Z", STALE.usgs, NOW)).toBe(true); // 6h15 > 6h
    expect(isStale("2026-09-19T11:00:00Z", STALE.weather, NOW)).toBe(true); // 3h15 > 3h
    expect(isStale("2026-09-19T12:30:00Z", STALE.reports, NOW)).toBe(false);
  });
});

describe("relativeTime", () => {
  it("plain-language buckets", () => {
    expect(relativeTime(null, NOW)).toBe("unknown");
    expect(relativeTime("garbage", NOW)).toBe("unknown");
    expect(relativeTime("2026-09-19T14:14:40Z", NOW)).toBe("just now");
    expect(relativeTime("2026-09-19T13:50:00Z", NOW)).toBe("25 min ago");
    expect(relativeTime("2026-09-19T14:13:00Z", NOW)).toBe("2 min ago");
    expect(relativeTime("2026-09-19T13:15:00Z", NOW)).toBe("1 hour ago");
    expect(relativeTime("2026-09-19T11:15:00Z", NOW)).toBe("3 hours ago");
    expect(relativeTime("2026-09-18T14:15:00Z", NOW)).toBe("1 day ago");
    expect(relativeTime("2026-09-16T14:15:00Z", NOW)).toBe("3 days ago");
    expect(relativeTime("2026-09-19T14:25:00Z", NOW)).toBe("in 10 min");
  });
});

describe("formatting in America/New_York", () => {
  it("formatLocalTime → 12-hour clock with AM/PM and a plain space", () => {
    expect(formatLocalTime("2026-09-19T14:15:00Z")).toBe("10:15 AM");
    expect(formatLocalTime("2026-09-19T00:05:00Z")).toBe("8:05 PM"); // previous evening EDT
    expect(formatLocalTime("2026-12-19T14:15:00Z")).toBe("9:15 AM"); // EST
    expect(formatLocalTime("bad")).toBe("");
    expect(formatLocalTime("2026-09-19T14:15:00Z", "UTC")).toBe("2:15 PM");
  });
  it("formatLocalDate → weekday, month day", () => {
    expect(formatLocalDate("2026-09-19T14:15:00Z")).toBe("Sat, Sep 19");
    expect(formatLocalDate("2026-09-20T02:00:00Z")).toBe("Sat, Sep 19"); // still Saturday in Florida
  });
  it("formatClock", () => {
    expect(formatClock(10, 30)).toBe("10:30 AM");
    expect(formatClock(0, 5)).toBe("12:05 AM");
    expect(formatClock(12, 0)).toBe("12:00 PM");
    expect(formatClock(17, 45)).toBe("5:45 PM");
  });
});

describe("time-zone helpers", () => {
  it("localParts reflects Eastern wall-clock time and weekday", () => {
    const p = localParts(NOW);
    expect(p).toMatchObject({ year: 2026, month: 9, day: 19, hour: 10, minute: 15, weekday: 6, date: "2026-09-19" });
    const midnightUtc = localParts(new Date("2026-09-20T03:59:00Z"));
    expect(midnightUtc.date).toBe("2026-09-19");
    expect(midnightUtc.hour).toBe(23);
  });
  it("tzOffsetMs is −4h in EDT and −5h in EST", () => {
    expect(tzOffsetMs(NOW)).toBe(-4 * 3600e3);
    expect(tzOffsetMs(new Date("2026-12-19T14:15:00Z"))).toBe(-5 * 3600e3);
  });
  it("zonedTimeToUtc round-trips local wall-clock times across DST", () => {
    expect(zonedTimeToUtc("2026-09-19", 10, 30).toISOString()).toBe("2026-09-19T14:30:00.000Z");
    expect(zonedTimeToUtc("2027-03-10", 10, 30).toISOString()).toBe("2027-03-10T15:30:00.000Z");
    expect(zonedTimeToUtc("2026-11-01", 12, 0).toISOString()).toBe("2026-11-01T17:00:00.000Z"); // DST ends that morning
    expect(zonedTimeToUtc("2026-09-19", 10, 30, "UTC").toISOString()).toBe("2026-09-19T10:30:00.000Z");
  });
});
