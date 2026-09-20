/**
 * Map style constants shared by ParkMap and MiniMap.
 * Keyless OpenFreeMap vector style by default (commercial OK, attribution auto-injected).
 * Swap NEXT_PUBLIC_MAP_STYLE_URL to the Versatiles fallback if OpenFreeMap is down.
 * Only `import type` from maplibre-gl here so this file stays safe to import anywhere.
 */
import type { Map as MaplibreMap } from "maplibre-gl";

export const DEFAULT_MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
export const FALLBACK_MAP_STYLE_URL = "https://tiles.versatiles.org/assets/styles/colorful/style.json";

export const MAP_STYLE_URL: string = process.env.NEXT_PUBLIC_MAP_STYLE_URL || DEFAULT_MAP_STYLE_URL;

/** [[west, south], [east, north]]: whole state incl. the panhandle and the Keys. */
export const FLORIDA_BOUNDS: [[number, number], [number, number]] = [
  [-87.63, 24.4],
  [-80.0, 31.0],
];

/** Marker text labels are visually hidden below this zoom (still in the accessible name). */
export const LABEL_ZOOM = 7.5;

export const MAP_ARIA_LABEL = "Map of Florida springs and swim areas";

/** Attribution text OpenFreeMap asks for; MapLibre injects it from the style automatically. */
export const MAP_ATTRIBUTION = "OpenFreeMap © OpenMapTiles Data from OpenStreetMap";

/**
 * Brand recolour applied once the style has loaded. Layer ids come from the positron
 * style; each is guarded with getLayer() so other styles simply skip what they lack.
 */
const BRAND_PAINT: ReadonlyArray<readonly [layerId: string, property: string, value: string | number]> = [
  ["background", "background-color", "#f5f3ea"], // ivory (--color-cream)
  ["water", "fill-color", "#cfeff2"], // spring water
  ["waterway", "line-color", "#7fd0d8"],
  ["park", "fill-color", "#dfe9d0"], // sage parks
  ["park", "fill-opacity", 0.9],
  ["landcover_wood", "fill-color", "#cfe0bf"], // sage wood
  ["landcover_grass", "fill-color", "#e3ebd3"],
];

export function applyBrandPaint(map: MaplibreMap): void {
  for (const [layerId, property, value] of BRAND_PAINT) {
    try {
      if (map.getLayer(layerId)) map.setPaintProperty(layerId, property, value);
    } catch {
      // A style without this layer, or a style still loading: nothing to recolour.
    }
  }
}
