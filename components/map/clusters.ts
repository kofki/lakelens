/**
 * Turning 616 park pins into a handful of bubbles.
 *
 * At continental zoom every park was its own 40px marker, so the map was a solid mat of
 * pins with no country visible under it, and the browser was laying out 616 DOM nodes on
 * every pan.
 *
 * Clustered here rather than by MapLibre's GeoJSON source.
 *
 * The source approach needs the answer read back with `querySourceFeatures`, which only
 * sees features in tiles that are currently loaded. With nothing actually drawn from the
 * source, whether those tiles load at all is up to MapLibre's own optimisations: the same
 * page returned 21 features on one load and 0 on the next, so every marker on the map
 * vanished intermittently while the data behind them was perfectly fine.
 *
 * supercluster is what MapLibre uses internally, so the behaviour is the same and the
 * timing is ours. Bubbles and pins are still plain DOM markers, because drawing the counts
 * as a symbol layer means naming a font, and the two basemaps this app falls back between
 * ship different glyph sets: a style swap would silently blank every number.
 */
import Supercluster from "supercluster";
import type { ParkWithStatus } from "@/lib/types";
import { levelFromIndex, pointClosed, pointCount, type MapPoint } from "@/lib/mapPoints";

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
  /** Parks this feature stands for: 1 for a park, more for a database grid cell. */
  count?: number;
  /** Closed parks among them. */
  closed?: number;
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
 * The same thing from the map's own compact points.
 *
 * The map no longer receives whole parks, so this is the shape clustering actually runs on
 * now. The slug stands in for the id: it is what the marker links to and what the preview
 * fetches by, and it compresses far better than a uuid.
 */
export function pointsToFeatureCollection(
  points: readonly MapPoint[],
): GeoJSON.FeatureCollection<GeoJSON.Point, ParkFeatureProps> {
  return {
    type: "FeatureCollection",
    features: points.map((point, i) => {
      const [slug, , lat, lng, level] = point;
      const count = pointCount(point);
      return {
        type: "Feature",
        // A cell has no slug; its index keeps its key unique among the bubbles.
        properties: { id: slug || `cell-${i}`, level: levelFromIndex(level), count, closed: pointClosed(point) },
        geometry: { type: "Point", coordinates: [lng, lat] },
      };
    }),
  };
}

/** Build the index straight from map points. */
export function buildPointIndex(points: readonly MapPoint[]): ParkIndex {
  const index: ParkIndex = new Supercluster({
    radius: CLUSTER_RADIUS,
    maxZoom: CLUSTER_MAX_ZOOM,
    minPoints: 2,
    map: CLUSTER_PROPERTIES.weighted.map,
    reduce: CLUSTER_PROPERTIES.weighted.reduce,
  });
  index.load(pointsToFeatureCollection(points).features as never[]);
  return index;
}

/**
 * Sums carried up into each bubble.
 *
 * A bubble that says only "48" hides the one thing the map is for. Counting the closed
 * parks inside it lets the bubble say "48, some shut" without the reader zooming in first.
 */
const CLUSTER_PROPERTIES = {
  closed: {
    map: (props: ParkFeatureProps) => ({ closed: props.level === "closed" ? 1 : 0, count: 1 }),
    reduce: (accumulated: ClusterSums, props: ClusterSums) => {
      accumulated.closed += props.closed;
      accumulated.count += props.count;
    },
  },
  /**
   * The same sums when a feature may already stand for many parks. supercluster's own
   * point_count counts features, so a bubble made of three grid cells would say 3 when it
   * holds 300; the real total is carried up here instead.
   */
  weighted: {
    map: (props: ParkFeatureProps) => ({ closed: props.closed ?? 0, count: props.count ?? 1 }),
    reduce: (accumulated: ClusterSums, props: ClusterSums) => {
      accumulated.closed += props.closed;
      accumulated.count += props.count;
    },
  },
};

interface ClusterSums {
  closed: number;
  count: number;
}

export type ParkIndex = Supercluster<ParkFeatureProps, ClusterSums>;

/** Build the index. Cheap enough to rebuild whenever the park list changes. */
export function buildIndex(parks: ParkWithStatus[]): ParkIndex {
  const index: ParkIndex = new Supercluster({
    radius: CLUSTER_RADIUS,
    maxZoom: CLUSTER_MAX_ZOOM,
    // Cluster counts have to stay right at the zoom the reader is actually at.
    minPoints: 2,
    map: CLUSTER_PROPERTIES.closed.map,
    reduce: CLUSTER_PROPERTIES.closed.reduce,
  });
  index.load(toFeatureCollection(parks).features as never[]);
  return index;
}

/**
 * What to draw for a viewport.
 *
 * `bbox` is [west, south, east, north] and zoom is rounded, because supercluster indexes
 * integer zooms and asking for 4.7 answers for 4: rounding keeps the bubbles in step with
 * what the reader sees rather than one level behind.
 */
export function pinsFor(index: ParkIndex, bbox: [number, number, number, number], zoom: number): MapPin[] {
  const clusters = index.getClusters(bbox, Math.round(zoom));
  const out: MapPin[] = [];
  for (const feature of clusters) {
    const coords = feature.geometry?.coordinates;
    if (!coords || coords.length < 2) continue;
    const props = feature.properties as unknown as Record<string, unknown>;
    if (props.cluster === true) {
      out.push({
        kind: "cluster",
        clusterId: Number(props.cluster_id),
        key: `c${props.cluster_id}`,
        lng: coords[0]!,
        lat: coords[1]!,
        count: Number(props.count ?? props.point_count ?? 0),
        closed: Number(props.closed ?? 0),
      });
      continue;
    }
    // A database cell that supercluster left on its own is still many parks: draw it as a
    // bubble. It has no supercluster id, so expanding it zooms in on its position instead.
    const cellCount = Number(props.count ?? 1);
    if (cellCount > 1) {
      out.push({
        kind: "cluster",
        clusterId: -1,
        key: `g${String(props.id)}`,
        lng: coords[0]!,
        lat: coords[1]!,
        count: cellCount,
        closed: Number(props.closed ?? 0),
      });
      continue;
    }
    const id = typeof props.id === "string" ? props.id : null;
    if (id) out.push({ kind: "park", key: id, parkId: id });
  }
  return out;
}

export interface ClusterBubble {
  kind: "cluster";
  /** supercluster's cluster id for `getClusterExpansionZoom`, or -1 for a database grid cell. */
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



/** Plain-language name for a bubble, because a number alone is not a label. */
export function clusterLabel(bubble: ClusterBubble): string {
  const places = `${bubble.count} swim spots`;
  if (bubble.closed === 0) return `${places}. Zoom in to see them.`;
  if (bubble.closed === bubble.count) return `${places}, all shut right now. Zoom in to see them.`;
  return `${places}, ${bubble.closed} shut right now. Zoom in to see them.`;
}
