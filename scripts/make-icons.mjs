/**
 * Generates the LakeLens app icons from a simple SVG mark (water drop + leaf + waves)
 * in the "spring forest" palette (app/globals.css). Keep components/ui/Logo.tsx in sync.
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

const IVORY = "#f5f3ea"; // --color-cream
const AMBER = "#e08a2e"; // --color-sunset
const MOSS = "#7a9a5b"; // --color-moss
const TEAL = "#3fb5c2"; // --color-lagoon
const TEAL_LIGHT = "#cfeff2"; // spring-water tint (map water)

/** The mark itself (drop + leaf highlight + two waves) on a 512 x 512 canvas. */
const ART = `
  <path d="M256 64c-48 70-100 130-100 192a100 100 0 0 0 200 0c0-62-52-122-100-192z" fill="${AMBER}"/>
  <path d="M234 308c-12-48 18-92 66-102c4 48-18 92-66 102z" fill="${MOSS}"/>
  <path d="M240 302l56-92" fill="none" stroke="${IVORY}" stroke-width="7" stroke-linecap="round"/>
  <path d="M40 400c36-28 72-28 108 0s72 28 108 0 72-28 108 0 72 28 108 0" fill="none" stroke="${TEAL}" stroke-width="26" stroke-linecap="round"/>
  <path d="M40 452c36-28 72-28 108 0s72 28 108 0 72-28 108 0 72 28 108 0" fill="none" stroke="${TEAL_LIGHT}" stroke-width="22" stroke-linecap="round"/>
`;

/**
 * @param {object} o
 * @param {boolean} o.rounded  rounded-square background (favicon / regular icons)
 * @param {number}  o.scale    shrink the art towards the centre (maskable safe zone = 0.8)
 */
function svg({ rounded, scale }) {
  const offset = (512 * (1 - scale)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="LakeLens">
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="${IVORY}"/>
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
