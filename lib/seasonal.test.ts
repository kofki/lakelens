import { describe, expect, it } from "vitest";
import { formatSeasonRange, isInSwimSeason, swimSeasonReason } from "./seasonal";

const BLUE = { open: "04-01", close: "11-14", note: "Manatee season Nov 15 – Mar 31." };
const WRAP = { open: "11-01", close: "03-31" };

describe("swim season", () => {
  it("null season is always open", () => {
    expect(isInSwimSeason(null, new Date("2026-01-15T15:00:00Z"))).toBe(true);
    expect(swimSeasonReason(null, new Date("2026-01-15T15:00:00Z"))).toBeNull();
  });
  it("inclusive open/close boundaries in local time", () => {
    expect(isInSwimSeason(BLUE, new Date("2026-04-01T12:00:00Z"))).toBe(true);
    expect(isInSwimSeason(BLUE, new Date("2026-11-14T23:00:00Z"))).toBe(true); // 6 PM EST Nov 14
    expect(isInSwimSeason(BLUE, new Date("2026-11-15T05:30:00Z"))).toBe(false); // 12:30 AM EST Nov 15
    expect(isInSwimSeason(BLUE, new Date("2026-04-01T03:30:00Z"))).toBe(false); // still Mar 31 in Florida
    expect(isInSwimSeason(BLUE, new Date("2026-07-04T15:00:00Z"))).toBe(true);
  });
  it("windows that wrap the new year", () => {
    expect(isInSwimSeason(WRAP, new Date("2026-12-25T15:00:00Z"))).toBe(true);
    expect(isInSwimSeason(WRAP, new Date("2027-02-10T15:00:00Z"))).toBe(true);
    expect(isInSwimSeason(WRAP, new Date("2026-07-10T15:00:00Z"))).toBe(false);
  });
  it("reason text", () => {
    expect(swimSeasonReason(BLUE, new Date("2026-07-04T15:00:00Z"))).toBeNull();
    expect(swimSeasonReason(BLUE, new Date("2026-12-01T15:00:00Z"))).toBe(
      "Closed for the season — swimming reopens Apr 1 (season Apr 1 – Nov 14). Manatee season Nov 15 – Mar 31.",
    );
    expect(formatSeasonRange(BLUE)).toBe("Apr 1 – Nov 14");
  });
});
