"use client";

import type { CSSProperties } from "react";
import { Marker } from "@vis.gl/react-maplibre";
import type { ParkWithStatus } from "@/lib/types";
import { STATUS_META } from "@/lib/status";
import { StatusIcon } from "@/components/ui/StatusIcon";
import { cn } from "@/components/ui/cn";

export interface ParkMarkerProps {
  item: ParkWithStatus;
  selected: boolean;
  /** Below LABEL_ZOOM the text is visually hidden (still in the accessible name). */
  showLabel: boolean;
  onSelect: (id: string) => void;
}

/** Accessible name for a marker button: "Ichetucknee Springs State Park: Likely full soon (estimate)". */
export function markerLabel(item: ParkWithStatus): string {
  const meta = STATUS_META[item.status.level];
  return `${item.park.name}: ${meta.label}${item.status.isEstimate ? " (estimate)" : ""}`;
}

/**
 * A real <button> portalled into the MapLibre marker element, so every park is a
 * keyboard tab stop with icon + text + colour (never colour alone).
 */
export function ParkMarker({ item, selected, showLabel, onSelect }: ParkMarkerProps) {
  const { park, status } = item;
  const meta = STATUS_META[status.level];
  return (
    <Marker
      longitude={park.lng}
      latitude={park.lat}
      anchor="bottom"
      offset={[0, -4]}
      style={{ zIndex: selected ? 2 : 1 }}
      onClick={(e) => {
        // The map's own click handler deselects; don't let this click reach it.
        e.originalEvent.stopPropagation();
        onSelect(park.id);
      }}
    >
      <button
        type="button"
        data-park-marker={park.id}
        aria-label={markerLabel(item)}
        aria-pressed={selected}
        style={{ "--marker-color": meta.hex } as CSSProperties}
        className={cn(
          "relative flex min-h-11 cursor-pointer items-center gap-1 rounded-full border-2 border-(--marker-color) bg-white px-2.5 py-1 text-sm font-extrabold text-cocoa shadow-md",
          // small pointer tail under the pill, same colour as the border
          "after:absolute after:left-1/2 after:top-full after:-mt-1.5 after:size-3 after:-translate-x-1/2 after:rotate-45 after:border-b-2 after:border-r-2 after:border-(--marker-color) after:bg-white",
          selected && "ring-3 ring-sunset ring-offset-2 ring-offset-cream",
        )}
      >
        <StatusIcon level={status.level} className="size-5 text-(--marker-color)" />
        <span className={showLabel ? "whitespace-nowrap" : "sr-only"}>{meta.shortLabel}</span>
      </button>
    </Marker>
  );
}
