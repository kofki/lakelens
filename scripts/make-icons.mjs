/**
 * Generates the LakeLens app icons from the SVG mark: a lens looking at water.
 * Palette is the "spring forest" set in app/globals.css. Keep components/ui/Logo.tsx in sync.
 *   node scripts/make-icons.mjs
 * Writes: public/icons/logo.svg, icon-192.png, icon-512.png, icon-512-maskable.png,
 *         app/icon.png (64px favicon), app/apple-icon.png (180px, full bleed).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ICONS_DIR = path.join(ROOT, "public", "icons");
const APP_DIR = path.join(ROOT, "app");

const FOREST = "#1f4d3a"; // --color-brown (the tile)
const IVORY = "#f5f3ea"; // --color-cream (the lens ring)
const AMBER = "#e08a2e"; // --color-sunset (the sun)
const TEAL = "#3fb5c2"; // --color-lagoon (the water)

/**
 * The mark: a lens looking at water.
 *
 * The old mark was an amber droplet, which read as heat rather than water and vanished on
 * a light browser tab because its background was ivory. This one is a dark tile so it holds
 * its shape anywhere, and the three shapes are legible at 16 px: ring, waterline, sun.
 */
const ART = `
  <circle cx="256" cy="248" r="118" fill="${FOREST}"/>
  <path d="M139 266 q29 -26 58 0 t58 0 t58 0 t58 0 A118 118 0 0 1 139 266 Z" fill="${TEAL}"/>
  <circle cx="303" cy="198" r="26" fill="${AMBER}"/>
  <circle cx="256" cy="248" r="132" fill="none" stroke="${IVORY}" stroke-width="30"/>
`;

/**
 * @param {object} o
 * @param {boolean} o.rounded  rounded-square background (favicon / regular icons)
 * @param {number}  o.scale    shrink the art towards the centre (maskable safe zone = 0.8)
 */
function svg({ rounded, scale }) {
  const offset = (512 * (1 - scale)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="LakeLens">
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="${FOREST}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">${ART}</g>
</svg>
`;
}

async function png(svgText, size, outFile) {
  await sharp(Buffer.from(svgText), { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toFile(outFile);
  console.log(`wrote ${path.relative(ROOT, outFile)} (${size}x${size})`);
}

await mkdir(ICONS_DIR, { recursive: true });

const rounded = svg({ rounded: true, scale: 1 });
const fullBleed = svg({ rounded: false, scale: 1 });
const maskable = svg({ rounded: false, scale: 0.8 });

await writeFile(path.join(ICONS_DIR, "logo.svg"), rounded);
console.log("wrote public/icons/logo.svg");

await png(rounded, 192, path.join(ICONS_DIR, "icon-192.png"));
await png(rounded, 512, path.join(ICONS_DIR, "icon-512.png"));
await png(maskable, 512, path.join(ICONS_DIR, "icon-512-maskable.png"));
await png(rounded, 64, path.join(APP_DIR, "icon.png"));
await png(fullBleed, 180, path.join(APP_DIR, "apple-icon.png"));
