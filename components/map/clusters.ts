/**
 * Turning 616 park pins into a handful of bubbles.
 *
 * At continental zoom every park was its own 40px marker, so the map was a solid mat of
 * pins with no country visible under it, and the browser was laying out 616 DOM nodes on
 * every pan.
 *
 * MapLibre's GeoJSON source does the clustering, but nothing is drawn from it: the layers
 * it needs are transparent, and both bubbles and pins are read back out with
 * `querySourceFeatures` and rendered as DOM. Drawing the counts as a symbol layer would
 * mean naming a font, and the two basemaps this app can fall back between ship different
 * glyph sets, so a style swap would silently blank every number.
 */
import type { ParkWithStatus } from "@/lib/types";

export const CLUSTER_SOURCE_ID = "parks";
/** A transparent layer, present only so MapLibre builds tiles for the source. */
export const CLUSTER_LAYER_ID = "parks-clustered";
export const POINT_LAYER_ID = "parks-unclustered";

/**
 * Radius in pixels within which pins merge. 56 is a little wider than a marker, so two
 * bubbles never overlap, and narrow enough that neighbouring lakes stay separate as soon
 * as the reader zooms toward them.
 */
export const CLUSTER_RADIUS = 56;
/** Above this, every park is its own pin: by then the reader is looking at one area. */
export const CLUSTER_MAX_ZOOM = 10;

export interface ParkFeatureProps {
  id: string;
  /** "open" | "closed" | ... Kept on the feature so a bubble can be tinted by what is in it. */
  level: string;
}

export function toFeatureCollection(parks: ParkWithStatus[]): GeoJSON.FeatureCollection<GeoJSON.Point, ParkFeatureProps> {
  return {
    type: "FeatureCollection",
    features: parks.map((item) => ({
      type: "Feature",
      properties: { id: item.park.id, level: item.status.level },
      geometry: { type: "Point", coordinates: [item.park.lng, item.park.lat] },
    })),
  };
}

/**
 * Sums carried up into each bubble.
 *
 * A bubble that says only "48" hides the one thing the map is for. Counting the closed
 * parks inside it lets the bubble say "48, some shut" without the reader zooming in first.
 */
export const CLUSTER_PROPERTIES = {
  closed: ["+", ["case", ["==", ["get", "level"], "closed"], 1, 0]],
} as const;

export interface ClusterBubble {
  kind: "cluster";
  /** MapLibre's cluster id, which `getClusterExpansionZoom` takes. */
  clusterId: number;
  key: string;
  lng: number;
  lat: number;
  count: number;
  closed: number;
}

export interface SinglePin {
  kind: "park";
  key: string;
  parkId: string;
}

export type MapPin = ClusterBubble | SinglePin;

interface RawFeature {
  properties?: Record<string, unknown> | null;
  geometry?: { type?: string; coordinates?: number[] } | null;
}

/**
 * Source features to things we can render.
 *
 * `querySourceFeatures` returns tile features, so the same cluster can come back once per
 * tile it touches and a park sitting on a tile seam can come back twice. Both are keyed and
 * deduplicated here; without it React sees duplicate keys and the same pin is drawn twice.
 */
export function readPins(features: RawFeature[]): MapPin[] {
  const clusters = new Map<number, ClusterBubble>();
  const parks = new Map<string, SinglePin>();

  for (const feature of features) {
    const props = feature.properties ?? {};
    const coords = feature.geometry?.coordinates;

    if (props.cluster === true || typeof props.cluster_id === "number") {
      const clusterId = Number(props.cluster_id);
      const count = Number(props.point_count ?? 0);
      if (!Number.isFinite(clusterId) || count < 1) continue;
      if (!coords || coords.length < 2) continue;
      clusters.set(clusterId, {
        kind: "cluster",
        clusterId,
        key: `c${clusterId}`,
        lng: coords[0]!,
        lat: coords[1]!,
        count,
        closed: Number(props.closed ?? 0),
      });
      continue;
    }

    const id = typeof props.id === "string" ? props.id : null;
    if (!id) continue;
    parks.set(id, { kind: "park", key: id, parkId: id });
  }

  return [...clusters.values(), ...parks.values()];
}

/** Plain-language name for a bubble, because a number alone is not a label. */
export function clusterLabel(bubble: ClusterBubble): string {
  const places = `${bubble.count} swim spots`;
  if (bubble.closed === 0) return `${places}. Zoom in to see them.`;
  if (bubble.closed === bubble.count) return `${places}, all shut right now. Zoom in to see them.`;
  return `${places}, ${bubble.closed} shut right now. Zoom in to see them.`;
}
