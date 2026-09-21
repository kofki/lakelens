"use client";

import { useEffect } from "react";
import { useMap } from "@vis.gl/react-maplibre";
import type { Map as MaplibreMap } from "maplibre-gl";
import { pinsFor, type MapPin, type ParkIndex } from "./clusters";

export interface PinSyncProps {
  index: ParkIndex;
  onPins: (pins: MapPin[]) => void;
  /** Called with the viewport whenever it changes, so the pins can be fetched for it. */
  onViewport?: (bbox: [number, number, number, number]) => void;
  /** Run once per map: brand paint, padding, the initial fit. */
  onReady: (map: MaplibreMap) => void;
}

/**
 * Keeps the clustered pins in step with the viewport.
 *
 * This exists as a child of the map rather than as a ref on it because the `ref` never
 * populated and `onLoad` never fired: by the time this component's parent attached them,
 * the map had already been created and had already loaded. Nothing ran, so no brand paint,
 * no padding, no initial fit and no markers, while the data behind them was perfectly fine
 * and the canvas sat there looking like an empty map.
 *
 * `useMap()` reads the map out of the context the library itself provides, which is
 * populated by the time a child's effect runs regardless of what the parent saw.
 *
 * Renders nothing.
 */
export function PinSync({ index, onPins, onReady, onViewport }: PinSyncProps) {
  const { current } = useMap();
  /**
   * Resolved during render, not inside the effect.
   *
   * `useMap()` hands back a stable wrapper, but the map underneath it is replaced when
   * React remounts the tree, which StrictMode does on every dev mount. An effect that
   * reads the map once then captures it keeps listening to the map that was thrown away:
   * the canvas on screen belongs to the new one, so nothing ever fires and no marker
   * appears. Reading it here makes the instance itself a dependency, so a swap re-attaches.
   */
  const map = current?.getMap() ?? null;

  useEffect(() => {
    if (!map) return;

    const sync = () => {
      try {
        const b = map.getBounds();
        const bbox: [number, number, number, number] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
        onViewport?.(bbox);
        onPins(pinsFor(index, bbox, map.getZoom()));
      } catch {
        // Mid-resize, no bounds yet. The next event asks again.
      }
    };
    const ready = () => {
      onReady(map);
      sync();
    };

    /**
     * Sync straight away, before anything is loaded.
     *
     * Clustering needs `getBounds()` and `getZoom()`, both of which answer immediately.
     * Gating the first sync on the map being loaded is what left the map empty: `load` had
     * already fired by the time this effect attached, so waiting for it again waited
     * forever, and `loaded()` was false at that instant because the map was mid-resize.
     */
    sync();

    // The style being ready is what the one-time setup needs, and `styledata` fires again
    // on a style swap, so the brand paint survives the fallback basemap.
    if (map.isStyleLoaded()) ready();
    map.on("styledata", ready);
    map.on("load", ready);
    map.on("idle", sync);
    map.on("move", sync);
    map.on("moveend", sync);
    map.on("zoomend", sync);
    return () => {
      map.off("styledata", ready);
      map.off("load", ready);
      map.off("idle", sync);
      map.off("move", sync);
      map.off("moveend", sync);
      map.off("zoomend", sync);
    };
  }, [map, index, onPins, onReady, onViewport]);

  return null;
}
