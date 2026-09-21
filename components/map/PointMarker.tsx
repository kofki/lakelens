"use client";

import type { CSSProperties } from "react";
import { Marker } from "@vis.gl/react-maplibre";
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

  return (
    <Marker
      longitude={lng}
      latitude={lat}
      anchor="bottom"
      offset={[0, -4]}
      style={{ zIndex: selected ? 2 : 1 }}
      onClick={(e) => {
        // The map's own click handler deselects; don't let this reach it.
        e.originalEvent.stopPropagation();
        onSelect(slug);
      }}
    >
      <button
        type="button"
        data-park-marker={slug}
        aria-label={`${name}: ${meta.label}`}
        aria-pressed={selected}
        style={{ "--marker-edge": meta.edgeHex, "--marker-fg": meta.hex } as CSSProperties}
        className="relative flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full"
      >
        <span
          aria-hidden="true"
          className={cn(
            "relative flex size-10 items-center justify-center rounded-full border-[2.5px] border-(--marker-edge) bg-white shadow-md",
            "after:content-[''] after:absolute after:left-1/2 after:top-full after:-mt-2 after:size-3 after:-translate-x-1/2 after:rotate-45 after:border-b-[2.5px] after:border-r-[2.5px] after:border-(--marker-edge) after:bg-white",
            selected && "ring-3 ring-sunset-deep ring-offset-2 ring-offset-cream",
          )}
        >
          <StatusIcon level={level} source="hours" className="relative z-10 size-5 text-(--marker-fg)" />
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
