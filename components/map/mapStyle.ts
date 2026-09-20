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

/**
 * How far the map may be dragged.
 *
 * Every park is in the United States, so panning to the Atlantic or to Asia only loses the
 * reader. Wide enough to hold Alaska, Hawaii and Puerto Rico, because there are parks in
 * the first two and the box has to contain the data before it contains anything else.
 *
 * MapLibre keeps the centre inside this box rather than the whole viewport, so it is a
 * little larger than the land itself; a tighter box makes the map feel like it is fighting
 * the drag near the edges.
 */
/** [west, south, east, north], which is the shape MapGL's `maxBounds` takes. */
export const US_MAX_BOUNDS: [number, number, number, number] = [-180.0, 15.0, -60.0, 72.0];

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
/**
 * Recolouring the basemap so the water is the subject.
 *
 * The base style is Positron, a light-grey cartography where water is a pale wash behind
 * roads and buildings. That is the right default for a street map and the wrong one here:
 * this is a map of lakes, springs and rivers, and the water was the faintest thing on it.
 *
 * So water gets a real, saturated lagoon tint, rivers get a heavier line so they read at
 * low zoom, and the land is pulled toward a quiet sage that sits back. Water labels are
 * turned up too, because on this map the name of the lake is a destination, not scenery.
 *
 * The tint stays light enough for a white marker with a coloured edge to keep its contrast
 * when it sits on open water, which is where most of these markers are.
 */
const BRAND_PAINT: ReadonlyArray<readonly [layerId: string, property: string, value: string | number]> = [
  ["background", "background-color", "#f2f0e6"], // ivory, a shade quieter than the page
  ["water", "fill-color", "#a7dde5"], // lagoon: the most confident colour on the map
  ["waterway", "line-color", "#5cc3cd"],
  ["waterway", "line-width", 1.6],
  // Land recedes so the water reads first.
  ["park", "fill-color", "#e2ebd6"],
  ["park", "fill-opacity", 0.85],
  ["landcover_wood", "fill-color", "#d8e4cb"],
  ["landuse_residential", "fill-color", "#eceade"],
  // The name of the water is a destination here, not scenery. Positron splits these into
  // three layers; naming the wrong one fails silently, so all three are listed.
  ["water_name_point_label", "text-color", "#0f6f76"],
  ["water_name_point_label", "text-halo-color", "#f2f0e6"],
  ["water_name_point_label", "text-halo-width", 1.4],
  ["water_name_line_label", "text-color", "#0f6f76"],
  ["water_name_line_label", "text-halo-color", "#f2f0e6"],
  ["water_name_line_label", "text-halo-width", 1.4],
  ["waterway_line_label", "text-color", "#0f6f76"],
  ["waterway_line_label", "text-halo-color", "#f2f0e6"],
];

/** Layer ids BRAND_PAINT touches, so a test can check them against the live style. */
export const BRAND_PAINT_LAYERS: readonly string[] = [...new Set(BRAND_PAINT.map(([id]) => id))];

export function applyBrandPaint(map: MaplibreMap): void {
  for (const [layerId, property, value] of BRAND_PAINT) {
    try {
      if (map.getLayer(layerId)) map.setPaintProperty(layerId, property, value);
    } catch {
      // A style without this layer, or a style still loading: nothing to recolour.
    }
  }
}
