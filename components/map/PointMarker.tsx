"use client";

import type { CSSProperties } from "react";
import { Marker } from "@vis.gl/react-maplibre";
import { Waves } from "lucide-react";
import { levelFromIndex, type MapPoint } from "@/lib/mapPoints";
import { STATUS_META } from "@/lib/status";
import { StatusIcon } from "@/components/ui/StatusIcon";
import { cn } from "@/components/ui/cn";

export interface PointMarkerProps {
  point: MapPoint;
  selected: boolean;
  /** Below LABEL_ZOOM the text is visually hidden, still in the accessible name. */
  showLabel: boolean;
  onSelect: (slug: string) => void;
}

/** Muted forest: a pin for a place, not a verdict on it. 5.9:1 on white and 4:1 on map water, so it clears 3:1. */
const NEUTRAL_EDGE = "#4d6b5b";

/**
 * A pin drawn from a map point rather than a whole park.
 *
 * Same appearance as the old marker, different input: the map now receives four values per
 * park instead of a full row, because 22,679 full rows is 1.95 MB. The reason a park is
 * open or shut is not among those four, so the accessible name says the state without
 * claiming a cause — the park page has the reason, and this is a pin.
 */
export function PointMarker({ point, selected, showLabel, onSelect }: PointMarkerProps) {
  const [slug, name, lat, lng, levelIdx] = point;
  const level = levelFromIndex(levelIdx);
  const meta = STATUS_META[level];
  // Most lakes on the map have nothing to base a status on. Their pin is a plain water
  // mark with the lake's name: a question mark, or a label reading "Unknown", would say
  // we checked and could not tell, when there was simply nothing to check.
  const known = level !== "unknown";
  const edge = known ? meta.edgeHex : NEUTRAL_EDGE;
  const fg = known ? meta.hex : NEUTRAL_EDGE;

  return (
    <Marker
      longitude={lng}
      latitude={lat}
      anchor="bottom"
      offset={[0, -4]}
      // Parks we know something about sit above the bare lakes they are often surrounded by.
      style={{ zIndex: selected ? 3 : known ? 2 : 1 }}
      onClick={(e) => {
        // The map's own click handler deselects; don't let this reach it.
        e.originalEvent.stopPropagation();
        onSelect(slug);
      }}
    >
      <button
        type="button"
        data-park-marker={slug}
        aria-label={known ? `${name}: ${meta.label}` : name}
        aria-pressed={selected}
        style={{ "--marker-edge": edge, "--marker-fg": fg } as CSSProperties}
        className="relative flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full"
      >
        <span
          aria-hidden="true"
          className={cn(
            "relative flex items-center justify-center rounded-full bg-white",
            "after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:rotate-45 after:border-(--marker-edge) after:bg-white",
            // Two sizes, so the map reads at a glance: a full pin for a place with a status and
            // a page worth opening, a small quiet one for a lake we can only point at.
            known
              ? "size-11 border-[3px] border-(--marker-edge) shadow-md after:-mt-2 after:size-3 after:border-b-[3px] after:border-r-[3px]"
              : "size-7 border-2 border-(--marker-edge) shadow-sm after:-mt-1.5 after:size-2 after:border-b-2 after:border-r-2",
            selected && "ring-3 ring-sunset-deep ring-offset-2 ring-offset-cream",
          )}
        >
          {known ? (
            <StatusIcon level={level} source="hours" className="relative z-10 size-5 text-(--marker-fg)" />
          ) : (
            <Waves aria-hidden="true" focusable="false" className="relative z-10 size-3.5 text-(--marker-fg)" />
          )}
        </span>
        <span
          className={
            showLabel
              ? cn(
                  "absolute left-full top-1/2 ml-1 -translate-y-1/2 whitespace-nowrap rounded-full border bg-white/95 px-2 py-0.5 text-xs shadow-card",
                  known ? "border-mist-light font-extrabold text-ink" : "border-transparent font-semibold text-cocoa",
                )
              : "sr-only"
          }
        >
          {known ? `${name} · ${meta.shortLabel}` : name}
        </span>
      </button>
    </Marker>
  );
}
