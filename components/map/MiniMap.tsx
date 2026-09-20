"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useMemo } from "react";
import { AttributionControl, Map as MapGL, Marker, type MapEvent } from "@vis.gl/react-maplibre";
import { MapPin, SquareParking } from "lucide-react";
import type { ParkingLot } from "@/lib/types";
import type { LatLng } from "@/lib/distance";
import { cn } from "@/components/ui/cn";
import { MAP_STYLE_URL, applyBrandPaint } from "./mapStyle";
import { useWebGL2 } from "./useWebGL2";
import { detectMapsPlatform, directionsUrl } from "./directions";

export interface MiniMapProps {
  center: LatLng;
  parkName: string;
  lots: ParkingLot[];
  className?: string;
}

function lotLabel(lot: ParkingLot): string {
  const bits = [`${lot.name} parking`];
  if (lot.ada_spaces != null && lot.ada_spaces > 0) bits.push(`${lot.ada_spaces} accessible spaces`);
  if (lot.is_overflow) bits.push("overflow lot");
  if (lot.fee) bits.push(lot.fee);
  return bits.join(", ");
}

/**
 * Non-interactive map for the park detail page: park pin + parking lots as direction links.
 * A visually-hidden list of lots follows the map so screen readers get the same information
 * without the canvas; when WebGL is unavailable the list is shown instead.
 */
export function MiniMap({ center, parkName, lots, className }: MiniMapProps) {
  const webgl = useWebGL2();
  const platform = useMemo(() => detectMapsPlatform(), []);
  const mapsName = platform === "apple" ? "Apple Maps" : "Google Maps";

  const handleLoad = useCallback(
    (e: MapEvent) => {
      const map = e.target;
      applyBrandPaint(map);
      const canvas = map.getCanvas();
      canvas.setAttribute("aria-label", `Map of ${parkName} and its parking`);
      canvas.setAttribute("tabindex", "-1");
      if (lots.length > 0) {
        let west = center.lng;
        let east = center.lng;
        let south = center.lat;
        let north = center.lat;
        for (const lot of lots) {
          west = Math.min(west, lot.lng);
          east = Math.max(east, lot.lng);
          south = Math.min(south, lot.lat);
          north = Math.max(north, lot.lat);
        }
        map.fitBounds(
          [
            [west, south],
            [east, north],
          ],
          { padding: 48, maxZoom: 15.5, duration: 0 },
        );
      }
    },
    [center.lat, center.lng, lots, parkName],
  );

  const list = (
    <ul className={cn(webgl ? "sr-only" : "flex flex-col gap-2 p-3")} aria-label={`Parking at ${parkName}`}>
      {lots.length === 0 && <li className="text-sm text-mocha">No parking lots listed yet.</li>}
      {lots.map((lot) => (
        <li key={lot.id} className="text-sm">
          <a
            href={directionsUrl(lot.lat, lot.lng, `${lot.name} parking`, platform)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 font-bold text-brown underline"
          >
            <SquareParking aria-hidden="true" focusable="false" className="size-4 shrink-0" />
            {lotLabel(lot)}
            <span className="sr-only">: directions in {mapsName}, opens in a new tab</span>
          </a>
        </li>
      ))}
    </ul>
  );

  return (
    <div className={cn("overflow-hidden rounded-card border border-mist-light bg-white shadow-card", className)}>
      {webgl === null && (
        <div role="status" className="h-56 w-full animate-pulse bg-aqua/50">
          <span className="sr-only">Loading map…</span>
        </div>
      )}
      {webgl === false && <p className="px-3 pt-3 text-xs text-mocha">Map unavailable on this device.</p>}
      {webgl && (
        <div className="relative h-56 w-full [&_.maplibregl-ctrl-attrib-button]:size-11 [&_.maplibregl-ctrl-attrib.maplibregl-compact]:min-h-11 [&_.maplibregl-ctrl-attrib.maplibregl-compact]:min-w-11">
          <MapGL
            mapStyle={MAP_STYLE_URL}
            initialViewState={{ longitude: center.lng, latitude: center.lat, zoom: 14.5 }}
            style={{ width: "100%", height: "100%" }}
            interactive={false}
            attributionControl={false}
            onLoad={handleLoad}
          >
            <Marker longitude={center.lng} latitude={center.lat} anchor="bottom" style={{ zIndex: 1 }}>
              <div
                role="img"
                aria-label={parkName}
                className="flex size-9 items-center justify-center rounded-full bg-brown text-white shadow-md ring-2 ring-white"
              >
                <MapPin aria-hidden="true" focusable="false" className="size-5" strokeWidth={2.5} />
              </div>
            </Marker>
            {lots.map((lot) => (
              <Marker key={lot.id} longitude={lot.lng} latitude={lot.lat} anchor="bottom" style={{ zIndex: 2 }}>
                <a
                  href={directionsUrl(lot.lat, lot.lng, `${lot.name} parking`, platform)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Directions to ${lotLabel(lot)} (${mapsName}, opens in a new tab)`}
                  className="flex size-11 items-center justify-center rounded-full border-[2.5px] border-cyan-deep bg-white text-cyan-deep shadow-md"
                >
                  <SquareParking aria-hidden="true" focusable="false" className="size-6" />
                </a>
              </Marker>
            ))}
            <AttributionControl compact position="bottom-right" />
          </MapGL>
        </div>
      )}
      {list}
    </div>
  );
}

export default MiniMap;
