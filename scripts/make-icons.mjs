/**
 * Generates the LakeLens app icons from the SVG mark: a fish springing out of the water.
 * Forest on ivory, from app/globals.css. Keep components/ui/Logo.tsx in sync.
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

const FOREST = "#1f4d3a"; // --color-brown (the ink and the water)
const IVORY = "#f7f3e8"; // the paper the fish jumps against

/**
 * The mark: a fish springing out of the water on a coil.
 *
 * Two colours only, forest on ivory, so it prints and embroiders as well as it renders.
 * The dark water across the bottom third is what holds the tile's shape on a light page;
 * a faint forest edge does the rest at favicon size, where the ivory would otherwise melt
 * into an ivory browser tab.
 */
const COIL = Array.from({ length: 8 }, (_, i) => {
  const t = i / 7;
  const cx = (330 + t * 32).toFixed(1);
  const cy = (214 + t * 132).toFixed(1);
  return `<ellipse cx="${cx}" cy="${cy}" rx="26" ry="11" transform="rotate(-10 ${cx} ${cy})"/>`;
}).join("");

/** Water with rounded bottom corners to sit inside the rx=112 tile, or square for full bleed. */
function water(rounded) {
  const bottom = rounded
    ? "L512 400 A112 112 0 0 1 400 512 L112 512 A112 112 0 0 1 0 400 Z"
    : "L512 512 L0 512 Z";
  return `<path d="M0 352 C80 334 160 334 240 348 S420 362 512 344 ${bottom}"/>`;
}

const FISH = `
  <g fill="none" stroke="${FOREST}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M120 90 C175 58 262 82 296 178 C230 170 165 150 120 90 Z" stroke-width="15"/>
    <path d="M187 104 Q193 128 172 141" stroke-width="9"/>
    <g stroke-width="8.5">${COIL}</g>
  </g>
  <g fill="${FOREST}">
    <circle cx="159" cy="99" r="8"/>
    <path d="M214 80 Q252 74 274 95 Q256 96 244 104 Z"/>
    <path d="M176 156 L197 190 Q199 172 207 163 Z"/>
    <path d="M292 172 Q288 200 300 222 Q304 198 314 186 Z"/>
    <path d="M290 174 Q322 168 346 190 Q322 188 304 192 Z"/>
  </g>`;

const RIPPLES = `
  <g fill="none" stroke="${IVORY}" stroke-linecap="round" stroke-width="6">
    <path d="M6 370 Q180 410 340 393 T496 378" stroke-width="7"/>
    <path d="M322 368 Q362 382 404 366"/>
    <path d="M292 364 Q298 382 330 386"/>
    <path d="M420 362 Q438 368 430 380"/>
  </g>`;

/**
 * @param {object} o
 * @param {boolean} o.rounded  rounded-square background (favicon / regular icons)
 * @param {number}  o.scale    shrink the fish towards the centre (maskable safe zone = 0.8)
 */
function svg({ rounded, scale }) {
  const offset = (512 * (1 - scale)) / 2;
  const edge = rounded
    ? `<rect x="3" y="3" width="506" height="506" rx="109" fill="none" stroke="${FOREST}" stroke-opacity="0.18" stroke-width="6"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="LakeLens">
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="${IVORY}"/>
  <g fill="${FOREST}">${water(rounded)}</g>
  <g transform="translate(${offset} ${offset}) scale(${scale})">${FISH}${RIPPLES}</g>
  ${edge}
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
