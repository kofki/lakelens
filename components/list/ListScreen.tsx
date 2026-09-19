"use client";

import { useMemo, useState } from "react";
import { LocateFixed } from "lucide-react";
import { DEFAULT_FILTERS, type Filters, type ParkWithStatus } from "@/lib/types";
import { Wordmark } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import { ParkList } from "./ParkList";
import { FilterChips } from "./FilterChips";
import { SearchField } from "./SearchField";
import { SortControl } from "./SortControl";
import { useGeolocation } from "./useGeolocation";
import { useAccessibleParam } from "./useAccessibleParam";
import { countStatuses, countsMessage, filterParks, sortParks, withDistances, type SortKey } from "./parkListUtils";

export interface ListScreenProps {
  parks: ParkWithStatus[];
  initialFilters?: Partial<Filters>;
}

/** Full-page list: the primary screen-reader-friendly surface (no map required). */
export function ListScreen({ parks, initialFilters }: ListScreenProps) {
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS, ...initialFilters });
  useAccessibleParam(filters, setFilters);
  const [query, setQuery] = useState("");
  const [sortOverride, setSort] = useState<SortKey | null>(null);
  const geo = useGeolocation();

  // Default to distance once we have a location; the user's explicit choice always wins.
  const sort: SortKey = sortOverride ?? (geo.location ? "distance" : "status");

  const located = useMemo(() => withDistances(parks, geo.location), [parks, geo.location]);
  const filtered = useMemo(() => filterParks(located, filters, query), [located, filters, query]);
  const sorted = useMemo(() => sortParks(filtered, sort), [filtered, sort]);
  const counts = useMemo(() => countStatuses(filtered), [filtered]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-[calc(env(safe-area-inset-top)+12px)]">
      <header className="flex items-center justify-between">
        <div>
          <Wordmark />
          <h1 className="mt-1 text-2xl font-extrabold text-cocoa">All parks</h1>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={geo.request}
          aria-pressed={!!geo.location}
          className="rounded-full"
        >
          <LocateFixed aria-hidden="true" focusable="false" className="h-5 w-5" />
          <span className="ml-1">{geo.location ? "Location on" : "Use my location"}</span>
        </Button>
      </header>

      <div className="mt-3 flex flex-col gap-3">
        <SearchField id="list-search" value={query} onChange={setQuery} placeholder="Search springs and parks" />
        <FilterChips filters={filters} onChange={setFilters} counts={counts} />
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-mocha">{countsMessage(counts)}</p>
          <SortControl id="list-sort" value={sort} onChange={setSort} hasLocation={!!geo.location} />
        </div>
      </div>

      <div className="mt-4">
        {parks.length === 0 ? (
          <EmptyState title="Park data isn't available yet" body="We couldn't load parks right now. Try again in a minute." />
        ) : (
          <ParkList parks={sorted} userLocation={geo.location} sort={sort} />
        )}
      </div>

      <LiveRegion message={geo.message ?? ""} />
    </div>
  );
}
