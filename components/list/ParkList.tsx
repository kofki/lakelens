"use client";

import { useState } from "react";
import type { ParkWithStatus } from "@/lib/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { ParkCard } from "./ParkCard";
import { sortParks, withDistances, type LatLng, type SortKey } from "./parkListUtils";

export interface ParkListProps {
  parks: ParkWithStatus[];
  userLocation?: LatLng | null;
  sort?: SortKey;
  emptyTitle?: string;
  emptyBody?: string;
  className?: string;
  /** Park to highlight (desktop split view: the marker selected on the map). */
  selectedId?: string | null;
  /** When set, cards become selectable (click selects on the map; only the name link navigates). */
  onSelect?: (id: string) => void;
}

/**
 * How many cards are rendered before the reader asks for more.
 *
 * Every card is a photo, a status pill, a rating and a three-stat row, so the markup is
 * the dominant cost of this page: at 616 parks, rendering all of them put 286 kB gzipped
 * on the wire for a list nobody scrolls to the end of. The rest are one tap away and cost
 * nothing until then.
 */
const INITIAL_COUNT = 40;

/** List of ParkCards. Sorting (and distance annotation) happens here. */
export function ParkList({
  parks,
  userLocation,
  sort = "name",
  emptyTitle = "No parks match",
  emptyBody = "Try clearing a filter or searching for a different name.",
  className,
  selectedId = null,
  onSelect,
}: ParkListProps) {
  const [showAll, setShowAll] = useState(false);
  const items = sortParks(withDistances(parks, userLocation), sort);
  if (items.length === 0) {
    return <EmptyState title={emptyTitle} body={emptyBody} className={className} />;
  }

  const visible = showAll ? items : items.slice(0, INITIAL_COUNT);
  const remaining = items.length - visible.length;

  return (
    <div className={className ?? "flex flex-col gap-3"}>
      <ul className="flex flex-col gap-3" aria-label="Parks">
        {visible.map((item) => (
          <li key={item.park.id}>
            <ParkCard item={item} selected={item.park.id === selectedId} onSelect={onSelect} />
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-mist bg-white px-4 text-sm font-bold text-brown shadow-card hover:border-moss focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-taupe"
        >
          Show {remaining} more
        </button>
      )}
    </div>
  );
}
