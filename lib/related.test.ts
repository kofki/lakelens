import { describe, expect, it } from "vitest";
import { relatedTo, scoreRelated, MAX_RELATED_KM } from "./related";
import type { ParkWithStatus } from "./types";

const park = (over: Record<string, unknown>) =>
  ({
    park: { id: String(over.slug), slug: over.slug, name: over.slug, type: "lake", state: "MI", lat: 44, lng: -85, water_body: null, ...over },
  }) as unknown as ParkWithStatus;

const seed = park({ slug: "seed", water_body: "Higgins Lake", type: "lake", state: "MI" });

describe("scoreRelated", () => {
  it("ranks the same water above everything else", () => {
    const sameWater = scoreRelated(seed, park({ slug: "a", water_body: "Higgins Lake" }));
    const sameState = scoreRelated(seed, park({ slug: "b", water_body: "Other Lake" }));
    expect(sameWater.score).toBeGreaterThan(sameState.score);
    expect(sameWater.reason).toBe("Also on Higgins Lake");
  });

  it("names a spring as a spring", () => {
    const springSeed = park({ slug: "s", type: "spring", water_body: null });
    expect(scoreRelated(springSeed, park({ slug: "t", type: "spring" })).reason).toBe("Another spring");
  });

  it("never suggests the park you are looking at", () => {
    expect(scoreRelated(seed, seed).score).toBe(-1);
  });

  it("refuses a park too far to be an alternative", () => {
    const far = park({ slug: "far", lat: 44 + (MAX_RELATED_KM + 200) / 111.32 });
    expect(scoreRelated(seed, far).score).toBe(-1);
  });

  it("gives a reason even when only proximity stands out", () => {
    const near = park({ slug: "n", type: "river", state: "IN", lat: 44.1, lng: -85 });
    expect(scoreRelated(seed, near).reason).toBe("Close to it");
  });
});

describe("relatedTo", () => {
  const pool = [
    seed,
    park({ slug: "same-water", water_body: "Higgins Lake" }),
    park({ slug: "same-state" }),
    park({ slug: "already-seen" }),
    park({ slug: "far-away", lat: 10, lng: -85 }),
  ];

  it("puts the strongest match first and drops the seed and the far one", () => {
    const out = relatedTo(seed, pool);
    expect(out[0]!.item.park.slug).toBe("same-water");
    expect(out.map((r) => r.item.park.slug)).not.toContain("seed");
    expect(out.map((r) => r.item.park.slug)).not.toContain("far-away");
  });

  it("does not suggest a park the reader just came from", () => {
    const out = relatedTo(seed, pool, { exclude: new Set(["already-seen"]) });
    expect(out.map((r) => r.item.park.slug)).not.toContain("already-seen");
  });

  it("honours the limit", () => {
    expect(relatedTo(seed, pool, { limit: 1 })).toHaveLength(1);
  });

  it("returns nothing rather than filler when nothing is related", () => {
    expect(relatedTo(seed, [park({ slug: "x", lat: 10, lng: 10 })])).toEqual([]);
  });
});
