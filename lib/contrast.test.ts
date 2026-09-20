import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { contrastRatio } from "./contrast";
import { REPO_ROOT } from "@/scripts/build-seed";

const css = readFileSync(resolve(REPO_ROOT, "app/globals.css"), "utf8");

/** Read a colour token straight from the stylesheet, so the test tracks the real palette. */
function token(name: string): string {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`--color-${name} not found in globals.css`);
  return match[1]!.toLowerCase();
}

/**
 * Everything a status pin or a focus ring actually sits on.
 *
 * The map tint is the one that was missed: pins live on open water far more often than on
 * the page background, and the water is deliberately saturated now.
 */
const BACKDROPS = {
  cream: "#f5f3ea",
  white: "#ffffff",
  "map water": "#a7dde5",
  "map park": "#e2ebd6",
};

describe("status edges meet 1.4.11 on every surface they appear on", () => {
  for (const status of ["open", "likely", "full", "closed", "unknown"]) {
    it(`${status} edge is 3:1 or better everywhere`, () => {
      const edge = token(`status-${status}-edge`);
      for (const [name, bg] of Object.entries(BACKDROPS)) {
        expect(contrastRatio(edge, bg), `${status} on ${name}`).toBeGreaterThanOrEqual(3);
      }
    });
  }
});

describe("status text meets 4.5:1 on its own background", () => {
  for (const status of ["open", "likely", "full", "closed", "unknown"]) {
    it(`${status} text on ${status} background`, () => {
      expect(contrastRatio(token(`status-${status}`), token(`status-${status}-bg`))).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("the selected-marker ring is visible on the map", () => {
  it("clears 3:1 on the page and on a map tile", () => {
    for (const [name, bg] of Object.entries(BACKDROPS)) {
      expect(contrastRatio(token("sunset-deep"), bg), `selection ring on ${name}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("is not the lighter amber, which failed on both", () => {
    expect(contrastRatio(token("sunset"), "#a7dde5")).toBeLessThan(3);
  });
});

describe("the focus ring is visible wherever it lands", () => {
  it("clears 3:1 on every light surface", () => {
    for (const [name, bg] of Object.entries(BACKDROPS)) {
      expect(contrastRatio(token("ink"), bg), `focus ring on ${name}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("is no longer the cyan that failed on water", () => {
    // Kept as a regression guard: cyan measured 1.23:1 against the map tint.
    expect(contrastRatio(token("cyan"), "#a7dde5")).toBeLessThan(3);
    expect(css).toContain("outline: 3px solid var(--color-ink)");
  });

  it("carries a light halo, because ink alone fails on a dark photo", () => {
    expect(contrastRatio(token("ink"), "#2b2a25")).toBeLessThan(3);
    expect(css).toMatch(/box-shadow: 0 0 0 6px rgb\(255 255 255/);
  });
});
