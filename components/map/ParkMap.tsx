"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AttributionControl,
  Layer,
  Map as MapGL,
  Marker,
  NavigationControl,
  Source,
  type ErrorEvent,
  type MapEvent,
  type MapLayerMouseEvent,
  type MapRef,
  type ViewStateChangeEvent,
} from "@vis.gl/react-maplibre";
import type { ParkWithStatus } from "@/lib/types";
import type { LatLng } from "@/lib/distance";
import {
  CONTINENTAL_US_BOUNDS,
  CONTINENTAL_US_CENTER,
  FALLBACK_MAP_STYLE_URL,
  LABEL_ZOOM,
  MAP_ARIA_LABEL,
  MAP_STYLE_URL,
  applyBrandPaint,
  boundsForPoints,
} from "./mapStyle";
import { useWebGL2 } from "./useWebGL2";
import { MapSkeleton } from "./MapSkeleton";
import { MapUnavailable } from "./MapUnavailable";
import { ParkMarker } from "./ParkMarker";
import { ClusterMarker } from "./ClusterMarker";
import {
  CLUSTER_LAYER_ID,
  CLUSTER_MAX_ZOOM,
  CLUSTER_PROPERTIES,
  CLUSTER_RADIUS,
  CLUSTER_SOURCE_ID,
  POINT_LAYER_ID,
  readPins,
  toFeatureCollection,
  type ClusterBubble,
  type MapPin,
} from "./clusters";

export interface ParkMapProps {
  parks: ParkWithStatus[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  userLocation?: LatLng | null;
  /** Height of whatever overlays the bottom of the map (sheet + preview card), in px. */
  bottomInsetPx: number;
  /** Height of the floating header, in px. Controls and padding move below it. */
  topInsetPx?: number;
  /** [[west, south], [east, north]]; defaults to a box around the parks being rendered. */
  initialBounds?: [[number, number], [number, number]];
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** Gate on WebGL first; hooks for the map itself live in ParkMapInner. */

/** MapLibre refuses to fit when padding eats the canvas; keep at least 45 % of it visible. */
function safePadding(map: { getCanvas(): HTMLCanvasElement }, top: number, bottom: number) {
  const h = map.getCanvas().clientHeight || 800;
  const maxTotal = Math.round(h * 0.55);
  if (top + bottom <= maxTotal) return { top, bottom, left: 0, right: 0 };
  const scale = maxTotal / (top + bottom);
  return { top: Math.round(top * scale), bottom: Math.round(bottom * scale), left: 0, right: 0 };
}

export function ParkMap(props: ParkMapProps) {
  const webgl = useWebGL2();
  if (webgl === null) return <MapSkeleton />;
  if (webgl === false) return <MapUnavailable />;
  return <ParkMapInner {...props} />;
}

function ParkMapInner({
  parks,
  selectedId,
  onSelect,
  userLocation,
  bottomInsetPx,
  topInsetPx = 0,
  initialBounds,
}: ParkMapProps) {
  const mapRef = useRef<MapRef>(null);
  const parksRef = useRef(parks);
  useEffect(() => {
    parksRef.current = parks;
  }, [parks]);
  const [showLabels, setShowLabels] = useState(false);
  /**
   * What is actually on screen: a mix of bubbles and single pins, read back out of the
   * clustering source. Empty until the source has tiles, which is why the parks below are
   * rendered from this and not from `parks` directly.
   */
  const [pins, setPins] = useState<MapPin[]>([]);
  const [tileError, setTileError] = useState(false);
  /** Swapped to the keyless Versatiles style if OpenFreeMap fails to load its style/tiles. */
  const [styleUrl, setStyleUrl] = useState(MAP_STYLE_URL);
  const sourceErrors = useRef(0);
  /** true once the user pans/zooms; until then inset changes re-fit the parks */
  const interactedRef = useRef(false);

  // Fit whatever is on the map, so a park outside any one region is still on screen.
  const parksById = useMemo(() => new Map(parks.map((item) => [item.park.id, item])), [parks]);
  const featureCollection = useMemo(() => toFeatureCollection(parks), [parks]);

  const parkBounds = useMemo(
    () => boundsForPoints(parks.map((item) => item.park)) ?? CONTINENTAL_US_BOUNDS,
    [parks],
  );
  const fitBounds = initialBounds ?? parkBounds;
  const fitBoundsRef = useRef(fitBounds);
  useEffect(() => {
    fitBoundsRef.current = fitBounds;
  }, [fitBounds]);

  // Keep the visible (unpadded) area above the sheet so fitBounds / easeTo respect it.
  useEffect(() => {
    try {
      const map = mapRef.current;
      if (map) {
        map.setPadding(safePadding(map, topInsetPx, bottomInsetPx));
        if (!interactedRef.current) map.fitBounds(fitBounds, { padding: 12, duration: 0, maxZoom: 9 });
      }
    } catch {
      // map not ready yet; onLoad applies the padding too
    }
  }, [bottomInsetPx, topInsetPx, fitBounds]);

  // Centre the selected park in the visible area.
  useEffect(() => {
    if (!selectedId) return;
    const item = parksRef.current.find((p) => p.park.id === selectedId);
    const map = mapRef.current;
    if (!item || !map) return;
    map.easeTo({
      center: [item.park.lng, item.park.lat],
      // Past the clustering zoom, so a park picked from the list is always its own pin
      // rather than a number the reader then has to hunt through.
      zoom: Math.max(map.getZoom(), CLUSTER_MAX_ZOOM + 1),
      duration: prefersReducedMotion() ? 0 : 450,
      essential: true,
    });
  }, [selectedId]);

  /**
   * Re-read the source after anything that can change which tiles are loaded.
   *
   * `querySourceFeatures` answers from tiles, so it is empty before the first tile arrives
   * and stale immediately after a pan. Every event that moves or reloads the source calls
   * this, and the result is deduplicated in `readPins`.
   */
  const syncPins = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      if (!map.getSource(CLUSTER_SOURCE_ID)) return;
      setPins(readPins(map.querySourceFeatures(CLUSTER_SOURCE_ID) as never[]));
    } catch {
      // The source is mid-reload; the next idle event reads it again.
    }
  }, []);

  // A style swap (the OpenFreeMap fallback) rebuilds every source, so the pins we are
  // holding belong to a source that no longer exists.
  useEffect(() => {
    setPins([]);
  }, [styleUrl]);

  /**
   * Clicking a bubble zooms to the point where it breaks apart, rather than a fixed step.
   * A fixed step leaves dense clusters intact and needs three or four more taps.
   */
  const expandCluster = useCallback((bubble: ClusterBubble) => {
    const map = mapRef.current;
    if (!map) return;
    interactedRef.current = true;
    const source = map.getSource(CLUSTER_SOURCE_ID) as
      | { getClusterExpansionZoom?: (id: number) => Promise<number> }
      | undefined;
    const fallback = Math.min(map.getZoom() + 2, 17);
    const go = (zoom: number) =>
      map.easeTo({
        center: [bubble.lng, bubble.lat],
        zoom: Math.max(zoom, map.getZoom() + 0.5),
        duration: prefersReducedMotion() ? 0 : 420,
        essential: true,
      });
    const promise = source?.getClusterExpansionZoom?.(bubble.clusterId);
    if (promise) promise.then(go).catch(() => go(fallback));
    else go(fallback);
  }, []);

  const handleLoad = useCallback(
    (e: MapEvent) => {
      const map = e.target;
      applyBrandPaint(map);
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
      map.getCanvas().setAttribute("aria-label", MAP_ARIA_LABEL);
      map.setPadding(safePadding(map, topInsetPx, bottomInsetPx));
      map.on("dragstart", () => {
        interactedRef.current = true;
      });
      map.on("wheel", () => {
        interactedRef.current = true;
      });
      map.on("touchstart", () => {
        interactedRef.current = true;
      });
      // The +/- buttons and keyboard zoom are not drags, wheels or touches, so without
      // this the view snapped back to the fitted bounds the next time the sheet resized
      // and the map appeared impossible to zoom out of. `originalEvent` is what separates
      // a person zooming from our own fitBounds call.
      map.on("zoomstart", (ev) => {
        if ((ev as { originalEvent?: unknown }).originalEvent) interactedRef.current = true;
      });
      map.on("moveend", (ev) => {
        if ((ev as { originalEvent?: unknown }).originalEvent) interactedRef.current = true;
      });
      try {
        map.fitBounds(fitBoundsRef.current, { padding: 12, duration: 0, maxZoom: 9 });
      } catch {
        map.jumpTo({ center: [CONTINENTAL_US_CENTER.longitude, CONTINENTAL_US_CENTER.latitude], zoom: CONTINENTAL_US_CENTER.zoom });
      }
      setShowLabels(map.getZoom() >= LABEL_ZOOM);
      map.on("idle", syncPins);
      map.on("sourcedata", (ev) => {
        if ((ev as { sourceId?: string }).sourceId === CLUSTER_SOURCE_ID) syncPins();
      });
      syncPins();
    },
    // initial padding only; later changes go through the effect above
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const target = e.originalEvent?.target as HTMLElement | null;
      if (target?.closest?.(".maplibregl-marker")) return; // marker clicks select, not deselect
      onSelect(null);
    },
    [onSelect],
  );

  const handleZoomEnd = useCallback(
    (e: ViewStateChangeEvent) => {
      setShowLabels(e.viewState.zoom >= LABEL_ZOOM);
      syncPins();
    },
    [syncPins],
  );

  const handleMoveEnd = useCallback(() => syncPins(), [syncPins]);

  const handleError = useCallback(
    (e: ErrorEvent) => {
      const message = e.error?.message ?? String(e);
      console.warn("[LakeLens map]", message);
      // A style/TileJSON/tile fetch failure means the basemap provider is down for this
      // visitor: after a couple of them, fall back to the alternate keyless style once.
      if (/fetch|style|source|tile|network/i.test(message)) sourceErrors.current += 1;
      if (sourceErrors.current >= 2 && styleUrl === MAP_STYLE_URL && FALLBACK_MAP_STYLE_URL !== MAP_STYLE_URL) {
        setStyleUrl(FALLBACK_MAP_STYLE_URL);
        sourceErrors.current = 0;
        return;
      }
      setTileError(true);
    },
    [styleUrl],
  );

  const controlOffset = { marginTop: topInsetPx + 8 };

  return (
    <div
      className={
        "lakelens-map relative h-full w-full bg-cream " +
        // 44px targets for MapLibre's own controls
        "[&_.maplibregl-ctrl-group>button]:size-11 [&_.maplibregl-ctrl-attrib-button]:size-11 [&_.maplibregl-ctrl-attrib.maplibregl-compact]:min-h-11 [&_.maplibregl-ctrl-attrib.maplibregl-compact]:min-w-11"
      }
    >
      <MapGL
        ref={mapRef}
        mapStyle={styleUrl}
        initialViewState={CONTINENTAL_US_CENTER}
        style={{ width: "100%", height: "100%" }}
        minZoom={2}
        maxZoom={17}
        dragRotate={false}
        touchPitch={false}
        pitchWithRotate={false}
        attributionControl={false}
        onLoad={handleLoad}
        onClick={handleClick}
        onZoomEnd={handleZoomEnd}
        onMoveEnd={handleMoveEnd}
        onError={handleError}
      >
        {/* Transparent: the source exists to cluster, and both bubbles and pins are drawn
            as DOM markers below. A layer still has to reference it or no tiles are built. */}
        <Source
          id={CLUSTER_SOURCE_ID}
          type="geojson"
          data={featureCollection}
          cluster
          clusterRadius={CLUSTER_RADIUS}
          clusterMaxZoom={CLUSTER_MAX_ZOOM}
          clusterProperties={CLUSTER_PROPERTIES as unknown as Record<string, unknown>}
        >
          <Layer id={CLUSTER_LAYER_ID} type="circle" filter={["has", "point_count"]} paint={{ "circle-radius": 1, "circle-opacity": 0 }} />
          <Layer id={POINT_LAYER_ID} type="circle" filter={["!", ["has", "point_count"]]} paint={{ "circle-radius": 1, "circle-opacity": 0 }} />
        </Source>
        {pins.map((pin) => {
          if (pin.kind === "cluster") {
            return <ClusterMarker key={pin.key} bubble={pin} onExpand={expandCluster} />;
          }
          const item = parksById.get(pin.parkId);
          if (!item) return null;
          return (
            <ParkMarker
              key={pin.key}
              item={item}
              selected={item.park.id === selectedId}
              showLabel={showLabels}
              onSelect={onSelect}
            />
          );
        })}
        {userLocation && (
          <Marker longitude={userLocation.lng} latitude={userLocation.lat} anchor="center" style={{ zIndex: 0 }}>
            <div
              role="img"
              aria-label="Your location"
              className="size-4 rounded-full bg-lagoon shadow-md ring-4 ring-white"
            />
          </Marker>
        )}
        <NavigationControl position="top-left" showCompass={false} style={controlOffset} />
        <AttributionControl compact position="top-right" style={controlOffset} />
      </MapGL>
      {tileError && (
        <div
          role="status"
          className="absolute inset-x-3 z-10 flex items-start gap-2 rounded-tile border border-mist-light bg-white/95 p-3 text-sm text-cocoa shadow-card"
          style={{ top: topInsetPx + 8 }}
        >
          <p className="flex-1">Some map tiles didn&apos;t load. Park markers and the list below still work.</p>
          <button
            type="button"
            onClick={() => setTileError(false)}
            className="min-h-11 shrink-0 rounded-full px-3 font-bold text-brown underline hover:bg-mist-light"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

export default ParkMap;
