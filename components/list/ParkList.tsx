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
}

/** Server-safe list of ParkCards. Sorting (and distance annotation) happens here. */
export function ParkList({
  parks,
  userLocation,
  sort = "name",
  emptyTitle = "No parks match",
  emptyBody = "Try clearing a filter or searching for a different name.",
  className,
}: ParkListProps) {
  const items = sortParks(withDistances(parks, userLocation), sort);
  if (items.length === 0) {
    return <EmptyState title={emptyTitle} body={emptyBody} className={className} />;
  }
  return (
    <ul className={className ?? "flex flex-col gap-3"} aria-label="Parks">
      {items.map((item) => (
        <li key={item.park.id}>
          <ParkCard item={item} />
        </li>
      ))}
    </ul>
  );
}
