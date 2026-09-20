import { describe, expect, it } from "vitest";
import {
  FAVORITES_KEY,
  MAX_RECENTS,
  RECENTS_KEY,
  readFavorites,
  readRecents,
  recordVisit,
  toggleFavorite,
} from "./personal";

function mem(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

const throwing = {
  getItem() { throw new DOMException("blocked"); },
  setItem() { throw new DOMException("blocked"); },
};

describe("favorites", () => {
  it("adds, then removes", () => {
    const s = mem();
    expect(toggleFavorite(s, "blue-spring")).toEqual(["blue-spring"]);
    expect(readFavorites(s)).toEqual(["blue-spring"]);
    expect(toggleFavorite(s, "blue-spring")).toEqual([]);
  });

  it("puts the newest first", () => {
    const s = mem();
    toggleFavorite(s, "a");
    expect(toggleFavorite(s, "b")).toEqual(["b", "a"]);
  });
});

describe("recents", () => {
  it("moves a revisit to the front instead of repeating it", () => {
    const s = mem();
    recordVisit(s, "a");
    recordVisit(s, "b");
    expect(recordVisit(s, "a")).toEqual(["a", "b"]);
  });

  it("caps the list, so this stays a hint and not a browsing history", () => {
    const s = mem();
    for (let i = 0; i < MAX_RECENTS + 5; i += 1) recordVisit(s, `park-${i}`);
    expect(readRecents(s)).toHaveLength(MAX_RECENTS);
    expect(readRecents(s)[0]).toBe(`park-${MAX_RECENTS + 4}`);
  });

  it("ignores an empty slug", () => {
    const s = mem();
    recordVisit(s, "a");
    expect(recordVisit(s, "")).toEqual(["a"]);
  });
});

describe("hostile storage", () => {
  it("survives storage that throws, which is a private window", () => {
    expect(readFavorites(throwing)).toEqual([]);
    expect(() => toggleFavorite(throwing, "a")).not.toThrow();
    expect(readRecents(throwing)).toEqual([]);
    expect(() => recordVisit(throwing, "a")).not.toThrow();
  });

  it("survives no storage at all, which is the server", () => {
    expect(readFavorites(null)).toEqual([]);
    expect(readRecents(undefined)).toEqual([]);
    expect(() => recordVisit(null, "a")).not.toThrow();
  });

  it("ignores stored values that are not a list of slugs", () => {
    expect(readFavorites(mem({ [FAVORITES_KEY]: "not json" }))).toEqual([]);
    expect(readFavorites(mem({ [FAVORITES_KEY]: '{"a":1}' }))).toEqual([]);
    expect(readRecents(mem({ [RECENTS_KEY]: '["ok", 3, null, ""]' }))).toEqual(["ok"]);
  });
});
