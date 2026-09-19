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
import { FLORIDA_BOUNDS, LABEL_ZOOM, MAP_ARIA_LABEL, MAP_STYLE_URL, applyBrandPaint } from "./mapStyle";
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

  // Keep the visible (unpadded) area above the sheet so fitBounds / easeTo respect it.
  useEffect(() => {
    try {
      mapRef.current?.setPadding({ top: topInsetPx, bottom: bottomInsetPx, left: 0, right: 0 });
    } catch {
      // map not ready yet; onLoad applies the padding too
    }
  }, [bottomInsetPx, topInsetPx]);

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
      map.setPadding({ top: topInsetPx, bottom: bottomInsetPx, left: 0, right: 0 });
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

  const handleError = useCallback((e: ErrorEvent) => {
    console.warn("[LakeLens map]", e.error?.message ?? e);
    setTileError(true);
  }, []);

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
        mapStyle={MAP_STYLE_URL}
        initialViewState={{
          bounds: initialBounds ?? FLORIDA_BOUNDS,
          fitBoundsOptions: { padding: { top: topInsetPx + 16, bottom: bottomInsetPx + 16, left: 24, right: 24 } },
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
          className="absolute inset-x-3 z-10 flex items-start gap-2 rounded-xl bg-white/95 p-3 text-sm text-cocoa shadow-card"
          style={{ top: topInsetPx + 8 }}
        >
          <p className="flex-1">Some map tiles didn&apos;t load. Park markers and the list below still work.</p>
          <button
            type="button"
            onClick={() => setTileError(false)}
            className="min-h-11 shrink-0 rounded-full px-3 font-bold underline"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

export default ParkMap;
