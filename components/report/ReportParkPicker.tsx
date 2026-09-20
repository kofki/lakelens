"use client";

import { useMemo, useState } from "react";
import { LocateFixed } from "lucide-react";
import type { ParkWithStatus } from "@/lib/types";
import { kmToMiles } from "@/lib/distance";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusPill } from "@/components/ui/StatusPill";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import { SearchField } from "@/components/list/SearchField";
import { useGeolocation } from "@/components/list/useGeolocation";
import { filterParks, sortParks, withDistances } from "@/components/list/parkListUtils";
import { DEFAULT_FILTERS } from "@/lib/types";
import { ReportButton } from "./ReportButton";

export interface ReportParkPickerProps {
  parks: ParkWithStatus[];
}

export function ReportParkPicker({ parks }: ReportParkPickerProps) {
  const [query, setQuery] = useState("");
  const geo = useGeolocation();
  const items = useMemo(() => {
    const located = withDistances(parks, geo.location);
    const filtered = filterParks(located, DEFAULT_FILTERS, query);
    return sortParks(filtered, geo.location ? "distance" : "name");
  }, [parks, geo.location, query]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <SearchField id="report-search" value={query} onChange={setQuery} className="flex-1" placeholder="Find the park you're at" />
        <Button type="button" variant="secondary" onClick={geo.request} aria-pressed={!!geo.location} className="rounded-full px-3" aria-label="Sort by my location">
          <LocateFixed aria-hidden="true" focusable="false" className="h-5 w-5" />
        </Button>
      </div>
      {parks.length === 0 ? (
        <EmptyState title="Park data isn't available yet" body="Try again in a minute." />
      ) : items.length === 0 ? (
        <EmptyState title="No parks match" body="Try a different name." />
      ) : (
        <ul className="space-y-2" aria-label="Parks">
          {items.slice(0, 40).map((item) => (
            <li key={item.park.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-mist bg-white p-3">
              <div>
                <p className="text-base font-extrabold text-cocoa">{item.park.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-mocha">
                  <StatusPill level={item.status.level} source={item.status.source} size="sm" />
                  {item.distanceKm !== null && <span>{kmToMiles(item.distanceKm).toFixed(0)} mi away</span>}
                </div>
              </div>
              <ReportButton park={item.park} size="md" variant="secondary" label="Report" />
            </li>
          ))}
        </ul>
      )}
      <LiveRegion message={geo.message ?? ""} />
    </div>
  );
}
