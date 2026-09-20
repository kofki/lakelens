import { describe, expect, it } from "vitest";
import { formatScore, includesSampleData, ratingBars } from "./reviewScore";
import type { ReviewStats } from "./types";

const stats = (over: Partial<ReviewStats> = {}): ReviewStats => ({
  reviewCount: 10,
  averageRating: 4.3,
  sampleCount: 0,
  distribution: [0, 1, 2, 3, 4],
  ...over,
});

describe("formatScore", () => {
  it("always shows one decimal place, so the column does not jitter", () => {
    expect(formatScore(4)).toBe("4.0");
    expect(formatScore(5)).toBe("5.0");
    expect(formatScore(4.25)).toBe("4.3");
    expect(formatScore(3.999)).toBe("4.0");
  });
});

describe("ratingBars", () => {
  it("returns five bars, highest first, summing to the review count", () => {
    const bars = ratingBars(stats());
    expect(bars.map((b) => b.star)).toEqual([5, 4, 3, 2, 1]);
    expect(bars.reduce((n, b) => n + b.count, 0)).toBe(10);
    expect(bars[0]).toEqual({ star: 5, count: 4, percent: 40 });
    expect(bars[4]).toEqual({ star: 1, count: 0, percent: 0 });
  });

  it("has nothing to draw when there are no reviews", () => {
    expect(ratingBars(stats({ reviewCount: 0, distribution: [0, 0, 0, 0, 0] }))).toEqual([]);
    expect(ratingBars(null)).toEqual([]);
    expect(ratingBars(undefined)).toEqual([]);
  });

  it("never divides by zero when the counts disagree with the total", () => {
    const bars = ratingBars(stats({ reviewCount: 1, distribution: [0, 0, 0, 0, 1] }));
    expect(bars[0].percent).toBe(100);
  });
});

describe("includesSampleData", () => {
  it("is true as soon as one seeded row is in the score", () => {
    expect(includesSampleData(stats({ sampleCount: 1 }))).toBe(true);
    expect(includesSampleData(stats({ sampleCount: 0 }))).toBe(false);
    expect(includesSampleData(null)).toBe(false);
  });
});
