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

/** Accessible name for a marker button: "Ichetucknee Springs State Park: Open (estimate)". */
export function markerLabel(item: ParkWithStatus): string {
  const meta = STATUS_META[item.status.level];
  return `${item.park.name}: ${meta.label}${item.status.isEstimate ? " (estimate)" : ""}`;
}

/**
 * A real <button> portalled into the MapLibre marker element, so every park is a
 * keyboard tab stop with icon + text + colour (never colour alone).
 * Map marker: white circle, 2.5px status-edge border, status-coloured icon,
 * small tail, ink label chip beside it once zoomed in; selected = amber ring.
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
        style={{ "--marker-edge": meta.edgeHex, "--marker-fg": meta.hex } as CSSProperties}
        className="relative flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full"
      >
        <span
          aria-hidden="true"
          className={cn(
            "relative flex size-10 items-center justify-center rounded-full border-[2.5px] border-(--marker-edge) bg-white shadow-md",
            // small pointer tail under the circle, same colour as the border
            "after:absolute after:left-1/2 after:top-full after:-mt-2 after:size-3 after:-translate-x-1/2 after:rotate-45 after:border-b-[2.5px] after:border-r-[2.5px] after:border-(--marker-edge) after:bg-white",
            selected && "ring-3 ring-sunset ring-offset-2 ring-offset-cream",
          )}
        >
          <StatusIcon level={status.level} className="relative z-10 size-5 text-(--marker-fg)" />
        </span>
        <span
          className={
            showLabel
              ? "absolute left-full top-1/2 ml-1 -translate-y-1/2 whitespace-nowrap rounded-full border border-mist-light bg-white/95 px-2 py-0.5 text-xs font-extrabold text-ink shadow-card"
              : "sr-only"
          }
        >
          {meta.shortLabel}
        </span>
      </button>
    </Marker>
  );
}
