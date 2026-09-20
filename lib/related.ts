/**
 * "Because you looked at X."
 *
 * The only personalisation signal worth acting on here is the last place someone opened.
 * Somebody who just read about a spring is looking for springs; somebody reading about a
 * lake in Michigan is planning a weekend in Michigan, not in Arizona.
 *
 * Scored, not filtered, so the row always has something in it. Everything it reads is
 * already on the page: no profile, no history beyond the last few slugs in this browser.
 */
import { haversineKm } from "./distance";
import type { ParkWithStatus } from "./types";

export interface RelatedScore {
  item: ParkWithStatus;
  score: number;
  /** Why this one, in the reader's words. Null when nothing specific stood out. */
  reason: string | null;
}

/** Past this, two parks are not an alternative to each other, whatever else they share. */
export const MAX_RELATED_KM = 240;

/**
 * Same water is the strongest signal there is: two beaches on one lake are genuinely
 * interchangeable. Same state is the weakest that still means something.
 */
export function scoreRelated(seed: ParkWithStatus, candidate: ParkWithStatus): RelatedScore {
  if (candidate.park.id === seed.park.id) return { item: candidate, score: -1, reason: null };

  let score = 0;
  let reason: string | null = null;

  const km = haversineKm(
    { lat: seed.park.lat, lng: seed.park.lng },
    { lat: candidate.park.lat, lng: candidate.park.lng },
  );
  if (km > MAX_RELATED_KM) return { item: candidate, score: -1, reason: null };

  const seedWater = seed.park.water_body;
  if (seedWater && candidate.park.water_body === seedWater) {
    score += 6;
    reason = `Also on ${seedWater}`;
  }

  if (candidate.park.type === seed.park.type) {
    score += 2;
    // Only claim the type when nothing stronger was found, so the reason names the best
    // thing we know rather than the last thing we checked.
    reason ??= candidate.park.type === "spring" ? "Another spring" : `Another ${candidate.park.type}`;
  }

  if (candidate.park.state && candidate.park.state === seed.park.state) score += 1;

  // Closeness breaks ties without ever outweighing a real similarity.
  score += Math.max(0, 1 - km / MAX_RELATED_KM);

  if (!reason && km < 60) reason = "Close to it";
  return { item: candidate, score, reason };
}

/**
 * The best few alternatives to the last park someone opened.
 *
 * Excludes anything already in `exclude` (the rest of their recent list), because
 * suggesting the park they looked at just before is not a suggestion.
 */
export function relatedTo(
  seed: ParkWithStatus,
  all: readonly ParkWithStatus[],
  { limit = 6, exclude = new Set<string>() }: { limit?: number; exclude?: ReadonlySet<string> } = {},
): RelatedScore[] {
  return all
    .filter((c) => !exclude.has(c.park.slug))
    .map((c) => scoreRelated(seed, c))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
