"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AttributionControl,
  Map as MapGL,
  Marker,
  NavigationControl,
  type ErrorEvent,
  type MapEvent,
  type MapLayerMouseEvent,
  type MapRef,
  type ViewStateChangeEvent,
} from "@vis.gl/react-maplibre";
import type { ParkWithStatus } from "@/lib/types";
import type { LatLng } from "@/lib/distance";
import { FALLBACK_MAP_STYLE_URL, FLORIDA_BOUNDS, LABEL_ZOOM, MAP_ARIA_LABEL, MAP_STYLE_URL, applyBrandPaint } from "./mapStyle";
import { useWebGL2 } from "./useWebGL2";
import { MapSkeleton } from "./MapSkeleton";
import { MapUnavailable } from "./MapUnavailable";
import { ParkMarker } from "./ParkMarker";

export interface ParkMapProps {
  parks: ParkWithStatus[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  userLocation?: LatLng | null;
  /** Height of whatever overlays the bottom of the map (sheet + preview card), in px. */
  bottomInsetPx: number;
  /** Height of the floating header, in px. Controls and padding move below it. */
  topInsetPx?: number;
  /** [[west, south], [east, north]]; defaults to Florida. */
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
  const [tileError, setTileError] = useState(false);
  /** Swapped to the keyless Versatiles style if OpenFreeMap fails to load its style/tiles. */
  const [styleUrl, setStyleUrl] = useState(MAP_STYLE_URL);
  const sourceErrors = useRef(0);
  /** true once the user pans/zooms; until then inset changes re-fit the whole state */
  const interactedRef = useRef(false);

  // Keep the visible (unpadded) area above the sheet so fitBounds / easeTo respect it.
  useEffect(() => {
    try {
      const map = mapRef.current;
      if (map) {
        map.setPadding(safePadding(map, topInsetPx, bottomInsetPx));
        if (!interactedRef.current) map.fitBounds(initialBounds ?? FLORIDA_BOUNDS, { padding: 12, duration: 0, maxZoom: 9 });
      }
    } catch {
      // map not ready yet; onLoad applies the padding too
    }
  }, [bottomInsetPx, topInsetPx, initialBounds]);

  // Centre the selected park in the visible area.
  useEffect(() => {
    if (!selectedId) return;
    const item = parksRef.current.find((p) => p.park.id === selectedId);
    const map = mapRef.current;
    if (!item || !map) return;
    map.easeTo({
      center: [item.park.lng, item.park.lat],
      zoom: Math.max(map.getZoom(), 9),
      duration: prefersReducedMotion() ? 0 : 450,
      essential: true,
    });
  }, [selectedId]);

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
      try {
        map.fitBounds(initialBounds ?? FLORIDA_BOUNDS, { padding: 12, duration: 0, maxZoom: 9 });
      } catch {
        map.jumpTo({ center: [-83.3, 28.4], zoom: 5.4 });
      }
      setShowLabels(map.getZoom() >= LABEL_ZOOM);
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

  const handleZoomEnd = useCallback((e: ViewStateChangeEvent) => {
    setShowLabels(e.viewState.zoom >= LABEL_ZOOM);
  }, []);

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
        initialViewState={{
          longitude: -83.3,
          latitude: 28.4,
          zoom: 5.4,
        }}
        style={{ width: "100%", height: "100%" }}
        minZoom={5}
        maxZoom={17}
        dragRotate={false}
        touchPitch={false}
        pitchWithRotate={false}
        attributionControl={false}
        onLoad={handleLoad}
        onClick={handleClick}
        onZoomEnd={handleZoomEnd}
        onError={handleError}
      >
        {parks.map((item) => (
          <ParkMarker
            key={item.park.id}
            item={item}
            selected={item.park.id === selectedId}
            showLabel={showLabels}
            onSelect={onSelect}
          />
        ))}
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
