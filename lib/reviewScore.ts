/**
 * Pure helpers for the review score. Kept out of the component so they can be tested
 * without a JSX transform or an icon library.
 */
import type { ReviewStats } from "./types";

/**
 * Always one decimal place, so a park rated exactly 4 reads "4.0".
 *
 * Without this a list of scores jitters between one and two characters and the eye has to
 * re-find the column on every row.
 */
export function formatScore(average: number): string {
  return average.toFixed(1);
}

export interface RatingBar {
  star: number;
  count: number;
  /** Share of all reviews, 0 to 100. */
  percent: number;
}

/** Five bars, 5 stars down to 1. Empty when there is nothing to summarise. */
export function ratingBars(stats: ReviewStats | null | undefined): RatingBar[] {
  if (!stats || stats.reviewCount <= 0) return [];
  return [5, 4, 3, 2, 1].map((star) => {
    const count = stats.distribution[star - 1] ?? 0;
    return { star, count, percent: Math.round((count / stats.reviewCount) * 100) };
  });
}

/** True when a displayed score is built even partly from seeded demo rows. */
export function includesSampleData(stats: ReviewStats | null | undefined): boolean {
  return Boolean(stats && stats.sampleCount > 0);
}
