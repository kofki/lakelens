"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AttributionControl, Map as MapGL, Marker, NavigationControl, type MapEvent, type MapRef } from "@vis.gl/react-maplibre";
import { Accessibility, Car, DollarSign, Expand, MapPin, Navigation, Shrink, X } from "lucide-react";
import type { ParkingLot } from "@/lib/types";
import type { LatLng } from "@/lib/distance";
import { lotSummary, parkingBounds } from "@/lib/parking";
import { cn } from "@/components/ui/cn";
import { MAP_STYLE_URL, applyBrandPaint } from "./mapStyle";
import { useWebGL2 } from "./useWebGL2";
import { detectMapsPlatform, directionsUrl } from "./directions";

/** Longest fee string that still reads as a label rather than a sentence. */
const SHORT_FEE = 24;

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

  // A chip is a glanceable label. Anything longer than this is a sentence and belongs in
  // the body of the card instead.
  const chips: { label: string; icon: ReactNode }[] = [];
  if (selected) {
    if (selected.fee && selected.fee.length <= SHORT_FEE) {
      chips.push({ label: selected.fee, icon: <DollarSign aria-hidden="true" focusable="false" className="size-3.5 text-taupe" /> });
    }
    if (selected.capacity != null) {
      chips.push({ label: `about ${selected.capacity} spaces`, icon: <Car aria-hidden="true" focusable="false" className="size-3.5 text-taupe" /> });
    }
    if (selected.ada_spaces != null && selected.ada_spaces > 0) {
      chips.push({
        label: `${selected.ada_spaces} accessible`,
        icon: <Accessibility aria-hidden="true" focusable="false" className="size-3.5 text-taupe" />,
      });
    }
    if (selected.is_overflow) {
      chips.push({ label: "Overflow lot", icon: null });
    }
  }

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
            expanded ? "min-h-0 flex-1" : "h-72 md:h-[22rem]",
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
              cannot be styled to the design system or reached by keyboard. This card is the
              only place a lot's facts appear now, so it carries everything the lot cards
              used to: fee, size, accessible spaces, provenance and the ranger's notes.

              Three bands, because a ranger note can run to a paragraph: a fixed header, a
              scrolling body, and the directions button pinned to the bottom where it is
              always reachable without scrolling the card. */}
          {selected && (
            <div className="absolute bottom-3 left-3 right-3 flex max-h-[calc(100%-4.5rem)] flex-col overflow-hidden rounded-card border border-mist bg-white shadow-card md:right-auto md:w-80">
              <div className="flex shrink-0 items-start gap-2 border-b border-mist-light bg-cream px-3 py-2">
                <span
                  aria-hidden="true"
                  className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-brown text-xs font-extrabold text-white"
                >
                  {lots.indexOf(selected) + 1}
                </span>
                <h3 className="min-w-0 flex-1 text-sm font-extrabold leading-snug text-ink">{selected.name}</h3>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="-mr-2 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-full text-brown hover:bg-mist/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-taupe"
                >
                  <X aria-hidden="true" focusable="false" className="size-4" />
                  <span className="sr-only">Close lot details</span>
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2.5">
                {chips.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {chips.map((c) => (
                      <li
                        key={c.label}
                        className="inline-flex items-center gap-1 rounded-full border border-mist bg-cream px-2.5 py-1 text-xs font-bold text-cocoa"
                      >
                        {c.icon}
                        {c.label}
                      </li>
                    ))}
                  </ul>
                )}

                {/* A fee described in a sentence is prose, not a chip. */}
                {selected.fee && selected.fee.length > SHORT_FEE && (
                  <p className="text-xs leading-relaxed text-cocoa">
                    <span className="font-bold">Fee: </span>
                    {selected.fee}
                  </p>
                )}

                {selected.notes && <p className="text-xs leading-relaxed text-cocoa">{selected.notes}</p>}

                <p className="text-[0.7rem] text-mocha">
                  {selected.source === "curated" ? "Entered by hand from the park's website" : "From OpenStreetMap, unverified"}
                </p>
              </div>

              <div className="shrink-0 border-t border-mist-light p-2.5">
                <a
                  href={directionsUrl(selected.lat, selected.lng, `${selected.name} parking`, platform)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-brown px-4 text-sm font-bold text-white hover:bg-forest-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-taupe"
                >
                  <Navigation aria-hidden="true" focusable="false" className="size-4" />
                  Directions to this lot
                  <span className="sr-only">in {mapsName}, opens in a new tab</span>
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {list}
    </div>
  );
}

export default ParkingMap;
