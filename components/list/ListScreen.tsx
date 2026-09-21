"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LocateFixed, MapPinned, SlidersHorizontal } from "lucide-react";
import { DEFAULT_FILTERS, type Filters, type ParkWithStatus } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/EmptyState";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import { SiteFooter } from "@/components/nav/SiteFooter";
import { ParkList } from "./ParkList";
import { ParkTile } from "./ParkTile";
import { FilterChips } from "./FilterChips";
import { FilterSheet } from "./FilterSheet";
import { SearchField } from "./SearchField";
import { SortControl } from "./SortControl";
import { StateControl } from "./StateControl";
import { LocationPrompt } from "./LocationPrompt";
import { useFavorites, useRecents } from "./usePersonal";
import { nearestState } from "@/lib/nearestState";
import { stateName } from "@/lib/states";
import { relatedTo } from "@/lib/related";
import { useGeolocation } from "./useGeolocation";
import { useAccessibleParam } from "./useAccessibleParam";
import {
  activeFilterCount,
  availableStates,
  countStatuses,
  countsMessage,
  filterParks,
  groupParksByState,
  sortParks,
  withDistances,
  type StateGroup,
  type SortKey,
} from "./parkListUtils";

/** Display is left to the caller: the flat grid hides below sm, a grouped one does not. */
const TILE_GRID = "grid-cols-1 gap-5 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] md:gap-7";

function TileGrid({ items, label, className }: { items: ParkWithStatus[]; label?: string; className?: string }) {
  return (
    <ul
      aria-label={label}
      className={cn(TILE_GRID, className)}
    >
      {items.map((item) => (
        <li key={item.park.id}>
          <ParkTile item={item} />
        </li>
      ))}
    </ul>
  );
}

function StateSection({ group }: { group: StateGroup }) {
  const headingId = `state-${group.code}`;
  return (
    <section aria-labelledby={headingId} className="mt-6 first:mt-0">
      <h3 id={headingId} className="mb-3 border-b border-mist pb-2 text-lg font-extrabold text-brown">
        {group.name}
      </h3>
      <ul aria-labelledby={headingId} className={cn("grid", TILE_GRID)}>
        {group.items.map((item) => (
          <li key={item.park.id}>
            <ParkTile item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface ListScreenProps {
  parks: ParkWithStatus[];
  initialFilters?: Partial<Filters>;
  /** Every state and how many parks it has, counted in the database rather than in `parks`. */
  stateCounts?: Record<string, number>;
  /** The state this page was loaded for, from the URL. Null means the nationwide slice. */
  selectedState?: string | null;
}

const HERO_PHOTO = "/photos/ichetucknee-springs-state-park.jpg";

/** Tiles rendered before the reader asks for more, counted across all state groups. */
const TILE_COUNT = 40;

/**
 * "Discover" page: the primary screen-reader-friendly surface (no map required).
 * Phones keep the row cards; tablets and desktops get the hero plus photo
 * tile grid. Filtering, sorting and location are shared with the map screen.
 */
export function ListScreen({ parks, initialFilters, stateCounts, selectedState = null }: ListScreenProps) {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS, ...initialFilters });
  useAccessibleParam(filters, setFilters);
  const [query, setQuery] = useState("");
  const [sortOverride, setSort] = useState<SortKey | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  /**
   * Photo tiles are the heaviest thing on the page, so only the first screenful is
   * rendered. At 616 parks the full grid put 229 kB gzipped on the wire for a page
   * nobody scrolls to the end of.
   */
  const [showAllTiles, setShowAllTiles] = useState(false);
  const geo = useGeolocation();
  const favorites = useFavorites();
  const recents = useRecents();

  /**
   * The reader's own state, inferred from the nearest park rather than a geocoder, so no
   * third party is told where they are. Applied as a default only: an explicit choice of
   * "All states" is a choice, and re-imposing the local state on the next render would make
   * the picker feel broken.
   */
  const localState = useMemo(
    () => nearestState(geo.location, parks.map((item) => item.park)),
    [geo.location, parks],
  );
  /**
   * Derived, not stored. Writing the inferred state into `filters` from an effect meant a
   * render where the filter said one thing and the list showed another, and it fought the
   * picker: choosing "All states" would be overwritten on the next pass. `stateTouched`
   * records that the reader has an opinion, after which we stop having one.
   */
  const [stateTouched, setStateTouched] = useState(false);
  // The URL wins: the page was loaded for that state, so the filter has to agree with it.
  const effectiveState = selectedState ?? (stateTouched ? filters.state : (filters.state ?? localState));
  const effectiveFilters = useMemo(
    () => ({ ...filters, state: effectiveState }),
    [filters, effectiveState],
  );

  // Nearest once we know where the reader is, and the user's explicit choice always wins.
  // Without a location there is no distance to sort by, so name order is the fallback and
  // the prompt below is what turns it into distance for most people.
  const sort: SortKey = sortOverride ?? (geo.location ? "distance" : "name");

  const located = useMemo(() => withDistances(parks, geo.location), [parks, geo.location]);
  const filtered = useMemo(() => filterParks(located, effectiveFilters, query), [located, effectiveFilters, query]);
  const sorted = useMemo(() => sortParks(filtered, sort), [filtered, sort]);
  const visibleTiles = useMemo(
    () => (showAllTiles ? sorted : sorted.slice(0, TILE_COUNT)),
    [showAllTiles, sorted],
  );
  const remainingTiles = sorted.length - visibleTiles.length;
  const counts = useMemo(() => countStatuses(filtered), [filtered]);
  const filterCount = activeFilterCount(effectiveFilters);
  /**
   * Every state, from the database.
   *
   * Derived from `parks` this could only ever name the states the loaded slice happened to
   * cover, which is a much shorter list than the truth once the page stopped carrying the
   * country.
   */
  const stateOptions = useMemo(
    () =>
      stateCounts && Object.keys(stateCounts).length > 0
        ? Object.keys(stateCounts)
            .map((code) => ({ code, name: stateName(code) ?? code }))
            .sort((a, b) => a.name.localeCompare(b.name))
        : availableStates(parks),
    [stateCounts, parks],
  );
  /**
   * Grouping runs on the capped slice, not the whole list, so "Show 576 more" stays
   * one pass and the headings never reshuffle when the rest arrives.
   */
  /**
   * Saved parks and the "because you looked at" row.
   *
   * Both read the FULL list rather than the filtered one: a saved park in another state is
   * still saved, and hiding it because the state filter defaulted to somewhere else would
   * make saving feel unreliable. Related parks are scored against the last park opened.
   */
  const bySlug = useMemo(() => new Map(parks.map((item) => [item.park.slug, item])), [parks]);
  const savedItems = useMemo(
    () => favorites.map((slug) => bySlug.get(slug)).filter((item): item is ParkWithStatus => !!item),
    [favorites, bySlug],
  );
  const lastSeen = recents.map((slug) => bySlug.get(slug)).find((item): item is ParkWithStatus => !!item) ?? null;
  const related = useMemo(
    () => (lastSeen ? relatedTo(lastSeen, parks, { exclude: new Set(recents) }) : []),
    [lastSeen, parks, recents],
  );

  /**
   * Group by state only when looking at the whole country.
   *
   * The cap is 40 tiles and there are 51 states, so grouping a nationwide list produced a
   * heading with one card under it, over and over: a page of section titles rather than a
   * page of parks. With a state selected, which is now the default, every card is in that
   * state anyway and the heading says nothing.
   */
  const grouped = useMemo(
    () => (sort === "name" && !effectiveState ? groupParksByState(visibleTiles) : null),
    [sort, effectiveState, visibleTiles],
  );

  return (
    <div className="flex w-full flex-1 flex-col">
      <section
        aria-labelledby="discover-heading"
        className="relative overflow-hidden bg-forest-deep bg-cover bg-center px-6 pb-6 pt-[calc(env(safe-area-inset-top)+24px)] text-center md:pb-10 md:pt-10"
        style={{ backgroundImage: `url(${HERO_PHOTO})` }}
      >
        <div aria-hidden="true" className="absolute inset-0 bg-forest-deep/55" />
        <div className="relative z-10">
          <h1
            id="discover-heading"
            className="text-[2rem] font-extrabold leading-tight text-white drop-shadow-lg md:text-[3rem]"
          >
            Discover <span className="text-peach">freshwater</span> swim spots
          </h1>
          <p className="mx-auto mt-3 max-w-[600px] text-[1.05rem] text-white/90">
            Closure estimates, live conditions, parking and accessibility for every state park with swimming.
          </p>
        </div>
      </section>

      <div className="sticky top-0 z-30 border-b border-mist bg-cream/95 px-4 py-3 backdrop-blur md:top-[var(--top-nav-h,0px)] md:px-6">
        <div className="mx-auto flex max-w-[640px] items-center gap-2">
          <SearchField id="list-search" value={query} onChange={setQuery} className="flex-1" placeholder="Search springs and parks" />
          <Button
            type="button"
            variant="secondary"
            onClick={() => setFiltersOpen(true)}
            aria-label={`Filters and sort${filterCount ? `, ${filterCount} active` : ""}`}
            className="group rounded-full px-3"
          >
            <SlidersHorizontal aria-hidden="true" focusable="false" className="h-5 w-5" />
            {filterCount > 0 && (
              <span className="ml-1 rounded-full bg-sunset px-1.5 text-xs font-extrabold text-cocoa group-hover:bg-white group-hover:text-brown" aria-hidden="true">
                {filterCount}
              </span>
            )}
          </Button>
        </div>
        <FilterChips
          filters={filters}
          onChange={setFilters}
          counts={counts}
          className="mx-auto mt-3 hidden max-w-[1280px] md:block"
        />
        <div className="mx-auto mt-2 flex max-w-[1280px] flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className="text-sm font-bold text-mocha">{countsMessage(counts)}</p>
          <div className="flex items-center gap-2">
            <StateControl
              id="list-state"
              value={effectiveState}
              onChange={(state) => {
                setStateTouched(true);
                setFilters({ ...filters, state });
                // A different state is a different set of parks, so it is a navigation
                // rather than a filter over what is already here.
                router.push(state ? `/list?state=${state}` : "/list");
              }}
              options={stateOptions}
            />
            <SortControl id="list-sort" value={sort} onChange={setSort} hasLocation={!!geo.location} />
            <Button
              type="button"
              variant="secondary"
              onClick={geo.request}
              aria-pressed={!!geo.location}
              className="rounded-full px-3"
            >
              <LocateFixed aria-hidden="true" focusable="false" className="h-5 w-5" />
              <span className="sr-only sm:not-sr-only sm:ml-1">{geo.location ? "Location on" : "Use my location"}</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-6">
        <LocationPrompt
          status={geo.status}
          onRequest={geo.request}
          fallback={
            <section className="mx-auto mt-4 flex max-w-[1280px] items-center gap-3 rounded-tile border border-mist bg-white p-4 text-sm text-mocha shadow-card">
              <MapPinned aria-hidden="true" focusable="false" className="size-5 shrink-0 text-forest" />
              <p>
                Location is off for this site. Pick a state above to narrow the list, or search for a park by name.
              </p>
            </section>
          }
        />
      </div>

      <div id="park-list" tabIndex={-1} className="mx-auto w-full max-w-[1280px] px-4 py-5 pb-16 outline-none md:px-6">
        {parks.length === 0 ? (
          <EmptyState title="Park data isn't available yet" body="We couldn't load parks right now. Try again in a minute." />
        ) : (
          <>
            {savedItems.length > 0 && (
              <section aria-labelledby="saved-heading" className="mb-8">
                <h2 id="saved-heading" className="mb-3 text-lg font-extrabold text-brown">
                  Saved
                </h2>
                <TileGrid items={savedItems} label="Saved parks" className="grid" />
              </section>
            )}

            {lastSeen && related.length > 0 && (
              <section aria-labelledby="related-heading" className="mb-8">
                <h2 id="related-heading" className="mb-1 text-lg font-extrabold text-brown">
                  Because you looked at {lastSeen.park.name}
                </h2>
                <p className="mb-3 text-sm text-mocha">{related[0]?.reason ?? "Similar places nearby"}</p>
                <TileGrid items={related.map((r) => r.item)} label="Related parks" className="grid" />
              </section>
            )}

            <h2 className="sr-only">Parks</h2>
            <div className="sm:hidden">
              <ParkList parks={sorted} userLocation={geo.location} sort={sort} />
            </div>
            {sorted.length === 0 ? (
              <EmptyState
                title="No parks match"
                body="Try clearing a filter or searching for a different name."
                className="hidden sm:flex"
              />
            ) : (
              <>
                {grouped ? (
                  <div className="hidden sm:block">
                    {grouped.groups.map((group) => (
                      <StateSection key={group.code} group={group} />
                    ))}
                    {grouped.ungrouped.length > 0 && (
                      <TileGrid items={grouped.ungrouped} label="More parks" className="mt-6 grid first:mt-0" />
                    )}
                  </div>
                ) : (
                  <TileGrid items={visibleTiles} label="Parks" className="hidden sm:grid" />
                )}
                {remainingTiles > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAllTiles(true)}
                    className="mt-5 hidden min-h-11 w-full items-center justify-center rounded-full border border-mist bg-white px-4 text-sm font-bold text-brown shadow-card hover:border-moss focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-taupe sm:inline-flex"
                  >
                    Show {remainingTiles} more
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>

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
        stateOptions={stateOptions}
      />

      <LiveRegion message={geo.message ?? ""} />

      <SiteFooter />
    </div>
  );
}
