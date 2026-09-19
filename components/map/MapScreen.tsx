"use client";

import { useCallback, useMemo, useState } from "react";
import { LocateFixed, SlidersHorizontal } from "lucide-react";
import { DEFAULT_FILTERS, type Filters, type ParkWithStatus } from "@/lib/types";
import { Wordmark } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import { BottomSheet } from "@/components/sheet/BottomSheet";
import { ParkList } from "@/components/list/ParkList";
import { FilterChips } from "@/components/list/FilterChips";
import { FilterSheet } from "@/components/list/FilterSheet";
import { SearchField } from "@/components/list/SearchField";
import { useGeolocation } from "@/components/list/useGeolocation";
import { useAccessibleParam } from "@/components/list/useAccessibleParam";
import {
  activeFilterCount,
  countStatuses,
  countsMessage,
  filterParks,
  sortParks,
  withDistances,
  type SortKey,
} from "@/components/list/parkListUtils";
import { ParkMapLazy } from "./ParkMapLazy";
import { ParkPreviewCard } from "./ParkPreviewCard";

export interface MapScreenProps {
  parks: ParkWithStatus[];
  initialFilters?: Partial<Filters>;
}

/** Height of the floating header (wordmark + search row), used to pad map controls. */
const HEADER_PX = 124;

export function MapScreen({ parks, initialFilters }: MapScreenProps) {
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS, ...initialFilters });
  useAccessibleParam(filters, setFilters);
  const [query, setQuery] = useState("");
  const [sortOverride, setSort] = useState<SortKey | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetIndex, setSheetIndex] = useState(1);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [previewHeight, setPreviewHeight] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const geo = useGeolocation();

  // Default to distance once we have a location; the user's explicit choice always wins.
  const sort: SortKey = sortOverride ?? (geo.location ? "distance" : "status");

  const located = useMemo(() => withDistances(parks, geo.location), [parks, geo.location]);
  const filtered = useMemo(() => filterParks(located, filters, query), [located, filters, query]);
  const sorted = useMemo(() => sortParks(filtered, sort), [filtered, sort]);
  const counts = useMemo(() => countStatuses(filtered), [filtered]);
  const selected = selectedId ? (located.find((p) => p.park.id === selectedId) ?? null) : null;
  const filterCount = activeFilterCount(filters);

  const onSelect = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) setSheetIndex(0);
  }, []);

  const closePreview = useCallback(() => {
    setSelectedId(null);
    setPreviewHeight(0);
  }, []);

  return (
    <div className="relative h-[calc(100dvh-var(--bottom-nav-h)-env(safe-area-inset-bottom))] w-full overflow-hidden">
      <a
        href="#park-list"
        className="sr-only z-50 rounded-full bg-sunset px-4 py-2 font-bold text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to park list
      </a>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3 pt-[calc(env(safe-area-inset-top)+8px)]">
        <div className="pointer-events-auto flex items-center justify-between">
          <Wordmark />
          <Button
            type="button"
            variant="secondary"
            onClick={geo.request}
            aria-label={geo.location ? "Location on" : "Use my location"}
            aria-pressed={!!geo.location}
            className="rounded-full px-3"
          >
            <LocateFixed aria-hidden="true" focusable="false" className="h-5 w-5" />
            <span className="sr-only">{geo.location ? "Location on" : "Use my location"}</span>
          </Button>
        </div>
        <div className="pointer-events-auto mt-2 flex gap-2">
          <SearchField id="park-search" value={query} onChange={setQuery} className="flex-1" placeholder="Search springs and parks" />
          <Button
            type="button"
            variant="secondary"
            onClick={() => setFiltersOpen(true)}
            aria-label={`Filters and sort${filterCount ? `, ${filterCount} active` : ""}`}
            className="rounded-full px-3"
          >
            <SlidersHorizontal aria-hidden="true" focusable="false" className="h-5 w-5" />
            {filterCount > 0 && (
              <span className="ml-1 rounded-full bg-sunset px-1.5 text-xs font-extrabold text-white" aria-hidden="true">
                {filterCount}
              </span>
            )}
          </Button>
        </div>
      </header>

      <div className="absolute inset-0">
        <ParkMapLazy
          parks={filtered}
          selectedId={selectedId}
          onSelect={onSelect}
          userLocation={geo.location}
          bottomInsetPx={sheetHeight + previewHeight}
          topInsetPx={HEADER_PX}
        />
      </div>

      {selected && (
        <ParkPreviewCard
          item={selected}
          onClose={closePreview}
          onHeightChange={setPreviewHeight}
          className="fixed inset-x-3 z-30"
          style={{ bottom: `calc(var(--bottom-nav-h) + env(safe-area-inset-bottom) + ${sheetHeight + 12}px)` }}
        />
      )}

      <BottomSheet
        index={sheetIndex}
        onIndexChange={setSheetIndex}
        onHeightChange={setSheetHeight}
        ariaLabel="Park list"
        header={
          <div className="pb-2">
            <p className="text-sm font-bold text-mocha">{countsMessage(counts)}</p>
            <FilterChips filters={filters} onChange={setFilters} counts={counts} className="mt-2" />
          </div>
        }
      >
        <div id="park-list" tabIndex={-1} className="outline-none">
          {parks.length === 0 ? (
            <EmptyState
              title="Park data isn't available yet"
              body="We couldn't load parks right now. Pull down to refresh or try again in a minute."
            />
          ) : (
            <ParkList parks={sorted} userLocation={geo.location} sort={sort} />
          )}
        </div>
      </BottomSheet>

      <FilterSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        filters={filters}
        onFiltersChange={setFilters}
        sort={sort}
        onSortChange={setSort}
        hasLocation={!!geo.location}
        onRequestLocation={geo.request}
        locationMessage={geo.message}
        resultCount={filtered.length}
      />

      <LiveRegion message={geo.message ?? ""} />
    </div>
  );
}
