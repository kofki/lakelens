"use client";

import { Marker } from "@vis.gl/react-maplibre";
import { clusterLabel, type ClusterBubble } from "./clusters";
import { cn } from "@/components/ui/cn";

export interface ClusterMarkerProps {
  bubble: ClusterBubble;
  onExpand: (bubble: ClusterBubble) => void;
}

/**
 * Size follows the count, with a floor and a ceiling.
 *
 * A bubble has to stay a tap target at two parks and must not become a disc that hides the
 * state it sits in at two hundred, so it grows with the logarithm of the count rather than
 * the count.
 */
function diameter(count: number): number {
  const grown = 36 + Math.log10(Math.max(count, 1)) * 16;
  return Math.round(Math.min(grown, 64));
}

export function ClusterMarker({ bubble, onExpand }: ClusterMarkerProps) {
  const size = diameter(bubble.count);
  // Tinted only when everything inside is shut, which is a real answer. A part-closed
  // bubble stays neutral: colouring it would imply a verdict about parks the reader cannot
  // see yet.
  const allClosed = bubble.closed > 0 && bubble.closed === bubble.count;

  return (
    <Marker
      longitude={bubble.lng}
      latitude={bubble.lat}
      anchor="center"
      onClick={(e) => {
        e.originalEvent.stopPropagation();
        onExpand(bubble);
      }}
    >
      <button
        type="button"
        aria-label={clusterLabel(bubble)}
        style={{ width: size, height: size }}
        className={cn(
          "flex cursor-pointer items-center justify-center rounded-full border-[3px] font-extrabold tabular-nums shadow-md transition-transform hover:scale-105",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-taupe",
          allClosed
            ? "border-status-closed bg-white text-status-closed"
            : "border-forest bg-white text-forest-deep",
          bubble.count >= 100 ? "text-sm" : "text-[0.95rem]",
        )}
      >
        <span aria-hidden="true">{bubble.count}</span>
      </button>
    </Marker>
  );
}
