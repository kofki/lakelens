/**
 * Map style constants shared by the full-screen map and the parking map.
 * Keyless OpenFreeMap vector style by default (commercial OK, attribution auto-injected).
 * Swap NEXT_PUBLIC_MAP_STYLE_URL to the Versatiles fallback if OpenFreeMap is down.
 * Only `import type` from maplibre-gl here so this file stays safe to import anywhere.
 */
import type { Map as MaplibreMap } from "maplibre-gl";

export const DEFAULT_MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
export const FALLBACK_MAP_STYLE_URL = "https://tiles.versatiles.org/assets/styles/colorful/style.json";

export const MAP_STYLE_URL: string = process.env.NEXT_PUBLIC_MAP_STYLE_URL || DEFAULT_MAP_STYLE_URL;

/** [[west, south], [east, north]]: the lower 48, used only when there is nothing to fit. */
export const CONTINENTAL_US_BOUNDS: [[number, number], [number, number]] = [
  [-125.0, 24.4],
  [-66.9, 49.4],
];

/** Centre of CONTINENTAL_US_BOUNDS, for the pre-fit first frame and the fitBounds fallback. */
export const CONTINENTAL_US_CENTER = { longitude: -96.0, latitude: 37.0, zoom: 3.4 };

/**
 * Bounding box around the parks being rendered, so the first paint frames the data
 * wherever it is rather than a fixed region. A single park gets a small box around it
 * and fitBounds' maxZoom keeps it from dropping to street level.
 */
export function boundsForPoints(
  points: ReadonlyArray<{ lat: number; lng: number }>,
): [[number, number], [number, number]] | null {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const { lat, lng } of points) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  if (!Number.isFinite(west) || !Number.isFinite(south)) return null;
  // A degenerate box (one park, or several at the same spot) makes fitBounds jump to max
  // zoom, so give it a minimum span of roughly 11 km.
  const pad = 0.05;
  if (east - west < pad) {
    const mid = (east + west) / 2;
    west = mid - pad / 2;
    east = mid + pad / 2;
  }
  if (north - south < pad) {
    const mid = (north + south) / 2;
    south = mid - pad / 2;
    north = mid + pad / 2;
  }
  return [
    [west, south],
    [east, north],
  ];
}

/** Marker text labels are visually hidden below this zoom (still in the accessible name). */
export const LABEL_ZOOM = 7.5;

export const MAP_ARIA_LABEL = "Map of springs, lakes and rivers you can swim in";

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
