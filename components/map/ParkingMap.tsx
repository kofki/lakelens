"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AttributionControl, Map as MapGL, Marker, NavigationControl, type MapEvent, type MapRef } from "@vis.gl/react-maplibre";
import { Accessibility, Car, Expand, MapPin, Navigation, Shrink, X } from "lucide-react";
import type { ParkingLot } from "@/lib/types";
import type { LatLng } from "@/lib/distance";
import { lotSummary, parkingBounds } from "@/lib/parking";
import { cn } from "@/components/ui/cn";
import { MAP_STYLE_URL, applyBrandPaint } from "./mapStyle";
import { useWebGL2 } from "./useWebGL2";
import { detectMapsPlatform, directionsUrl } from "./directions";

export interface ParkingMapProps {
  center: LatLng;
  parkName: string;
  /** Already in display order: the marker number is the index in this array plus one. */
  lots: ParkingLot[];
  className?: string;
}


/**
 * Interactive parking map for the park page.
 *
 * The previous map was a fixed 224 px, non-interactive thumbnail hidden above the `lg`
 * breakpoint, so a lot was effectively just an icon: you could not tell which entrance it
 * sat by, or zoom in to see the turning. This one pans and zooms, opens full screen, and
 * numbers each pin to match the numbered cards beside it, so "lot 2" on the list is "2" on
 * the map. Every directions link uses the LOT's own coordinates, not the park centroid,
 * which for a park like Ichetucknee is two entrances and several kilometres apart.
 */
export function ParkingMap({ center, parkName, lots, className }: ParkingMapProps) {
  const webgl = useWebGL2();
  const platform = useMemo(() => detectMapsPlatform(), []);
  const mapsName = platform === "apple" ? "Apple Maps" : "Google Maps";
  const mapRef = useRef<MapRef | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const expandRef = useRef<HTMLButtonElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = lots.find((l) => l.id === selectedId) ?? null;

  const fit = useCallback(
    (duration: number) => {
      const map = mapRef.current;
      if (!map) return;
      map.fitBounds(parkingBounds(center, lots), { padding: 56, maxZoom: 16.5, duration });
    },
    [center, lots],
  );

  const handleLoad = useCallback(
    (e: MapEvent) => {
      const map = e.target;
      applyBrandPaint(map);
      const canvas = map.getCanvas();
      canvas.setAttribute("aria-label", `Map of parking at ${parkName}`);
      // The markers below are real buttons, so the canvas itself is not a tab stop.
      canvas.setAttribute("tabindex", "-1");
      fit(0);
    },
    [fit, parkName],
  );

  // Full screen is a CSS change on one map instance rather than a second map: MapLibre has
  // to be told its container resized, and the browser only knows the new size next frame.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      mapRef.current?.resize();
      fit(0);
    });
    return () => cancelAnimationFrame(id);
  }, [expanded, fit]);

  // While expanded the map behaves as a modal: Escape closes it and the page behind cannot
  // scroll. Focus moves to the close button and returns to the trigger on the way out.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    // Captured now: by cleanup time the collapsed trigger has been remounted, and the ref
    // would point at the new node (or null) instead of the button that was clicked.
    const trigger = expandRef.current;
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [expanded]);

  /** Always rendered. Visually hidden when the canvas is up, shown instead when it is not. */
  const list = lots.length === 0 ? null : (
    <ol className={cn(webgl ? "sr-only" : "flex flex-col gap-2 p-3")} aria-label={`Parking at ${parkName}`}>
      {lots.map((lot, i) => (
        <li key={lot.id} className="text-sm">
          <a
            href={directionsUrl(lot.lat, lot.lng, `${lot.name} parking`, platform)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 font-bold text-brown underline"
          >
            <Car aria-hidden="true" focusable="false" className="size-4 shrink-0" />
            {i + 1}. {lot.name}
            {lotSummary(lot) && `, ${lotSummary(lot)}`}
            <span className="sr-only">: directions in {mapsName}, opens in a new tab</span>
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <div
      className={cn(
        expanded
          ? "fixed inset-0 z-50 flex flex-col bg-cream"
          : "overflow-hidden rounded-card border border-mist-light bg-white shadow-card",
        className,
      )}
      {...(expanded ? { role: "dialog", "aria-modal": true, "aria-label": `Parking map for ${parkName}` } : {})}
    >
      {expanded && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-mist px-4 py-3">
          <h2 className="text-base font-extrabold text-brown">Parking at {parkName}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={() => setExpanded(false)}
            className="inline-flex size-11 items-center justify-center rounded-full text-brown hover:bg-mist/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-taupe"
          >
            <X aria-hidden="true" focusable="false" className="size-5" />
            <span className="sr-only">Close the parking map</span>
          </button>
        </div>
      )}

      {webgl === null && (
        <div role="status" className="h-64 w-full animate-pulse bg-aqua/50">
          <span className="sr-only">Loading map</span>
        </div>
      )}
      {webgl === false && <p className="px-3 pt-3 text-xs text-mocha">Map unavailable on this device.</p>}

      {webgl && (
        <div
          className={cn(
            "relative w-full",
            expanded ? "min-h-0 flex-1" : "h-64 md:h-72",
            "[&_.maplibregl-ctrl-attrib-button]:size-11 [&_.maplibregl-ctrl-attrib.maplibregl-compact]:min-h-11 [&_.maplibregl-ctrl-attrib.maplibregl-compact]:min-w-11",
          )}
        >
          <MapGL
            ref={mapRef}
            mapStyle={MAP_STYLE_URL}
            initialViewState={{ longitude: center.lng, latitude: center.lat, zoom: 15 }}
            style={{ width: "100%", height: "100%" }}
            attributionControl={false}
            onLoad={handleLoad}
            onClick={() => setSelectedId(null)}
          >
            <NavigationControl position="top-left" showCompass={false} />

            <Marker longitude={center.lng} latitude={center.lat} anchor="bottom" style={{ zIndex: 1 }}>
              <div
                role="img"
                aria-label={`${parkName} swim area`}
                className="flex size-9 items-center justify-center rounded-full bg-brown text-white shadow-md ring-2 ring-white"
              >
                <MapPin aria-hidden="true" focusable="false" className="size-5" strokeWidth={2.5} />
              </div>
            </Marker>

            {lots.map((lot, i) => {
              const isSelected = lot.id === selectedId;
              return (
                <Marker key={lot.id} longitude={lot.lng} latitude={lot.lat} anchor="bottom" style={{ zIndex: isSelected ? 3 : 2 }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(isSelected ? null : lot.id);
                    }}
                    aria-pressed={isSelected}
                    aria-label={`Parking ${i + 1}: ${lot.name}${lotSummary(lot) ? `, ${lotSummary(lot)}` : ""}`}
                    className={cn(
                      "flex size-11 items-center justify-center rounded-full border-[2.5px] text-base font-extrabold shadow-md transition-transform",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-taupe",
                      isSelected ? "scale-110 border-brown bg-brown text-white" : "border-cyan-deep bg-white text-cyan-deep hover:scale-105",
                    )}
                  >
                    {i + 1}
                  </button>
                </Marker>
              );
            })}

            <AttributionControl compact position="bottom-right" />
          </MapGL>

          {/* Expand / collapse sits over the canvas so the map keeps its full height. */}
          {!expanded && (
            <button
              ref={expandRef}
              type="button"
              onClick={() => setExpanded(true)}
              className="absolute right-3 top-3 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-mist bg-white/95 px-3 text-sm font-bold text-brown shadow-card backdrop-blur hover:border-moss focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-taupe"
            >
              <Expand aria-hidden="true" focusable="false" className="size-4" />
              Expand
            </button>
          )}
          {expanded && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="absolute right-3 top-3 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-mist bg-white/95 px-3 text-sm font-bold text-brown shadow-card backdrop-blur hover:border-moss"
            >
              <Shrink aria-hidden="true" focusable="false" className="size-4" />
              Close
            </button>
          )}

          {/* Tapping a pin opens its details here rather than in a MapLibre popup, which
              cannot be styled to the design system or reached by keyboard. */}
          {selected && (
            <div className="absolute inset-x-3 bottom-3 rounded-card border border-mist bg-white/97 p-3 shadow-card backdrop-blur">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-extrabold text-ink">
                    {lots.indexOf(selected) + 1}. {selected.name}
                  </p>
                  {lotSummary(selected) && <p className="mt-0.5 text-sm text-mocha">{lotSummary(selected)}</p>}
                  {selected.ada_spaces != null && selected.ada_spaces > 0 && (
                    <p className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-cocoa">
                      <Accessibility aria-hidden="true" focusable="false" className="size-4 text-taupe" />
                      {selected.ada_spaces} accessible spaces
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="-mr-1 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-full text-brown hover:bg-mist-light"
                >
                  <X aria-hidden="true" focusable="false" className="size-5" />
                  <span className="sr-only">Close lot details</span>
                </button>
              </div>
              <a
                href={directionsUrl(selected.lat, selected.lng, `${selected.name} parking`, platform)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-brown px-4 text-sm font-bold text-white hover:bg-forest-deep"
              >
                <Navigation aria-hidden="true" focusable="false" className="size-4" />
                Directions to this lot
                <span className="sr-only">in {mapsName}, opens in a new tab</span>
              </a>
            </div>
          )}
        </div>
      )}

      {list}
    </div>
  );
}

export default ParkingMap;
