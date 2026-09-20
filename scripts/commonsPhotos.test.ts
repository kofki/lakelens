import { describe, expect, it } from "vitest";
import { isAllowedLicence, photoYear, recencyScore, scoreCandidate, stripHtml, stripTracking } from "./fetch-commons-photos.ts";

const NOW = 2026;

describe("photoYear", () => {
  it("finds the year in either date field", () => {
    expect(photoYear({ DateTimeOriginal: { value: "2019-07-04 13:22:01" } })).toBe(2019);
    expect(photoYear({ DateTime: { value: "1908" } })).toBe(1908);
  });

  it("reads through the HTML Commons wraps dates in", () => {
    expect(photoYear({ DateTimeOriginal: { value: "<time class='dtstart'>2021-05-02</time>" } })).toBe(2021);
  });

  it("has no opinion when there is no date", () => {
    expect(photoYear({})).toBeNull();
    expect(photoYear(undefined)).toBeNull();
    expect(photoYear({ DateTime: { value: "unknown date" } })).toBeNull();
  });

  it("refuses an impossible year rather than trusting it", () => {
    expect(photoYear({ DateTime: { value: "3024" } })).toBeNull();
    expect(photoYear({ DateTime: { value: "1750" } })).toBeNull();
  });
});

describe("recencyScore", () => {
  it("prefers recent work", () => {
    expect(recencyScore(2024, NOW)).toBeGreaterThan(recencyScore(2010, NOW));
    expect(recencyScore(2010, NOW)).toBeGreaterThan(recencyScore(1908, NOW));
  });

  it("penalises a photograph old enough to be a document", () => {
    expect(recencyScore(1908, NOW)).toBeLessThan(0);
  });

  it("leaves an undated photo in the middle rather than discarding it", () => {
    expect(recencyScore(null, NOW)).toBe(0);
    expect(recencyScore(null, NOW)).toBeGreaterThan(recencyScore(1908, NOW));
    expect(recencyScore(null, NOW)).toBeLessThan(recencyScore(2024, NOW));
  });
});

describe("scoreCandidate", () => {
  it("never lets age outweigh relevance", () => {
    // A 1908 photograph of the right lake still beats a 2025 photograph of nothing.
    const right = scoreCandidate("Devils Lake shoreline", "Devils Lake Park", 2000, 1908);
    const wrong = scoreCandidate("County courthouse", "Devils Lake Park", 2000, 2025);
    expect(right.relevance).toBeGreaterThan(wrong.relevance);
  });

  it("breaks a tie between equally relevant photos on recency", () => {
    const recent = scoreCandidate("Devils Lake beach", "Devils Lake Park", 2000, 2024);
    const old = scoreCandidate("Devils Lake beach", "Devils Lake Park", 2000, 1950);
    expect(recent.relevance).toBe(old.relevance);
    expect(recent.quality).toBeGreaterThan(old.quality);
  });
});

describe("licences and urls", () => {
  it("accepts CC BY and its jurisdiction ports, and refuses share-alike", () => {
    for (const ok of ["CC BY 2.0", "CC BY 3.0 us", "CC0", "Public domain", "No restrictions"]) {
      expect(isAllowedLicence(ok), ok).toBe(true);
    }
    for (const no of ["CC BY-SA 4.0", "CC BY SA 3.0", "GFDL", ""]) {
      expect(isAllowedLicence(no), no).toBe(false);
    }
  });

  it("strips the analytics parameters Commons appends", () => {
    expect(stripTracking("https://x/y.jpg?utm_source=a&utm_campaign=b")).toBe("https://x/y.jpg");
    expect(stripTracking("https://x/y.jpg?width=800&utm_source=a")).toBe("https://x/y.jpg?width=800");
  });

  it("turns an HTML author fragment into a name", () => {
    expect(stripHtml('<a href="/wiki/User:Someone">Someone</a>')).toBe("Someone");
  });
});
