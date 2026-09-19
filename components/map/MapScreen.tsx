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
import { SortControl } from "@/components/list/SortControl";
import { useGeolocation } from "@/components/list/useGeolocation";
import { useAccessibleParam } from "@/components/list/useAccessibleParam";
import { useMediaQuery } from "@/components/list/useMediaQuery";
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

/** Height of the floating phone header (wordmark + search row), used to pad map controls. */
const HEADER_PX = 124;

/** Matches Tailwind's `lg` breakpoint: the split view (list left, map right). */
const DESKTOP_QUERY = "(min-width: 1024px)";

/**
 * Home screen. Phones: full-bleed map with a floating header, a persistent bottom
 * sheet holding the list and a preview card above it. Desktop (lg+): AllTrails-style
 * split view — list panel on the left, map filling the right, preview card docked in
 * the map's corner. Visibility is CSS-only (no flash); the media query hook only
 * drives map insets and where the preview card mounts.
 */
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
  const isDesktop = useMediaQuery(DESKTOP_QUERY);

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

  const locationLabel = geo.location ? "Location on" : "Use my location";

  const list =
    parks.length === 0 ? (
      <EmptyState
        title="Park data isn't available yet"
        body="We couldn't load parks right now. Pull down to refresh or try again in a minute."
      />
    ) : null;

  return (
    <div
      className={
        "relative w-full overflow-hidden lg:flex lg:flex-row " +
        "h-[calc(100dvh-var(--bottom-nav-h)-env(safe-area-inset-bottom))] md:h-[calc(100dvh-var(--top-nav-h,0px))]"
      }
    >
      <a
        href={isDesktop ? "#park-list-desktop" : "#park-list"}
        className="sr-only z-50 rounded-full bg-sunset px-4 py-2 font-bold text-cocoa focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to park list
      </a>

      {/* Phone chrome: floating header over the map */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3 pt-[calc(env(safe-area-inset-top)+8px)] lg:hidden">
        <div className="pointer-events-auto flex items-center justify-between">
          <Wordmark />
          <Button
            type="button"
            variant="secondary"
            onClick={geo.request}
            aria-label={locationLabel}
            aria-pressed={!!geo.location}
            className="rounded-full px-3"
          >
            <LocateFixed aria-hidden="true" focusable="false" className="h-5 w-5" />
            <span className="sr-only">{locationLabel}</span>
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
              <span className="ml-1 rounded-full bg-sunset px-1.5 text-xs font-extrabold text-cocoa" aria-hidden="true">
                {filterCount}
              </span>
            )}
          </Button>
        </div>
      </header>

      {/* Desktop panel: list on the left */}
      <aside
        aria-label="Park list"
        className="hidden w-[420px] shrink-0 flex-col border-r border-mist bg-white lg:flex xl:w-[480px]"
      >
        <div className="shrink-0 border-b border-mist px-4 pb-3 pt-4">
          <h1 className="text-xl font-extrabold text-cocoa">Florida springs &amp; swim areas</h1>
          <p className="mt-0.5 text-sm text-mocha">Closure estimates, live water and weather, and visitor reports.</p>
          <SearchField
            id="park-search-desktop"
            value={query}
            onChange={setQuery}
            className="mt-3"
            placeholder="Search springs and parks"
          />
          <FilterChips filters={filters} onChange={setFilters} counts={counts} className="mt-2" />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <p className="text-sm font-bold text-mocha">{countsMessage(counts)}</p>
            <div className="flex items-center gap-2">
              <SortControl id="park-sort-desktop" value={sort} onChange={setSort} hasLocation={!!geo.location} />
              <Button
                type="button"
                variant="secondary"
                onClick={geo.request}
                aria-label={locationLabel}
                aria-pressed={!!geo.location}
                className="rounded-full px-3"
              >
                <LocateFixed aria-hidden="true" focusable="false" className="h-5 w-5" />
                <span className="sr-only">{locationLabel}</span>
              </Button>
            </div>
          </div>
        </div>
        <div id="park-list-desktop" tabIndex={-1} className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-3 outline-none">
          {list ?? <ParkList parks={sorted} userLocation={geo.location} sort={sort} selectedId={selectedId} onSelect={onSelect} />}
        </div>
      </aside>

      {/* Map: full-bleed on phones, right pane on desktop */}
      <div className="absolute inset-0 lg:relative lg:inset-auto lg:h-full lg:min-w-0 lg:flex-1">
        <ParkMapLazy
          parks={filtered}
          selectedId={selectedId}
          onSelect={onSelect}
          userLocation={geo.location}
          bottomInsetPx={isDesktop ? 0 : sheetHeight + previewHeight}
          topInsetPx={isDesktop ? 0 : HEADER_PX}
        />
        {selected && isDesktop && (
          <ParkPreviewCard
            item={selected}
            onClose={closePreview}
            onHeightChange={setPreviewHeight}
            className="absolute bottom-4 left-4 w-[380px] max-w-[calc(100%-2rem)]"
          />
        )}
      </div>

      {selected && !isDesktop && (
        <ParkPreviewCard
          item={selected}
          onClose={closePreview}
          onHeightChange={setPreviewHeight}
          className="fixed inset-x-3 z-30 mx-auto max-w-xl lg:hidden"
          style={{ bottom: `calc(var(--bottom-nav-h) + env(safe-area-inset-bottom) + ${sheetHeight + 12}px)` }}
        />
      )}

      <BottomSheet
        index={sheetIndex}
        onIndexChange={setSheetIndex}
        onHeightChange={setSheetHeight}
        ariaLabel="Park list"
        className="lg:hidden"
        header={
          <div className="pb-2">
            <p className="text-sm font-bold text-mocha">{countsMessage(counts)}</p>
            <FilterChips filters={filters} onChange={setFilters} counts={counts} className="mt-2" />
          </div>
        }
      >
        <div id="park-list" tabIndex={-1} className="outline-none">
          {list ?? <ParkList parks={sorted} userLocation={geo.location} sort={sort} />}
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
