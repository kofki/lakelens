import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The logo as a data URI for share cards.
 *
 * Read from public/icons/logo.svg, which scripts/make-icons.mjs writes, so the cards can
 * never drift from the mark in the nav and on the home screen.
 */
export async function logoDataUri(): Promise<string> {
  const svg = await readFile(path.join(process.cwd(), "public", "icons", "logo.svg"), "utf8");
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CREAM = "#f5f3ea";
export const OG_FOREST = "#1f4d3a";
export const OG_LAGOON = "#0f6f76";
export const OG_INK = "#1c1b17";
export const OG_MOCHA = "#5b6657";
export const SLOGAN = "Check the water before you drive.";
