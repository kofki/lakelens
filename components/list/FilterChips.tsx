"use client";

import { Accessibility, ShieldCheck } from "lucide-react";
import type { Filters } from "@/lib/types";
import { Chip } from "@/components/ui/Chip";
import { cn } from "@/components/ui/cn";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import { countsMessage, type StatusCounts } from "./parkListUtils";

export interface FilterChipsProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  /** Counts of the currently visible list; announced as "12 parks shown, 3 full". */
  counts: StatusCounts;
  className?: string;
}

/**
 * The three contract filters as toggle chips. The accessible-entry predicate itself
 * lives in lib/distance.isAccessibleEntry (applied by filterParks); this only toggles it.
 */
export function FilterChips({ filters, onChange, counts, className }: FilterChipsProps) {
  const toggle = (key: keyof Filters) => onChange({ ...filters, [key]: !filters[key] });
  return (
    <div className={cn("relative", className)}>
      <div
        role="group"
        aria-label="Filter parks"
        className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <Chip
          selected={filters.accessibleEntry}
          onClick={() => toggle("accessibleEntry")}
          icon={<Accessibility aria-hidden="true" focusable="false" />}
          className="shrink-0"
        >
          Accessible water entry
        </Chip>
        <Chip
          selected={filters.guardedOnly}
          onClick={() => toggle("guardedOnly")}
          icon={<ShieldCheck aria-hidden="true" focusable="false" />}
          className="shrink-0"
        >
          Lifeguard on duty
        </Chip>
      </div>
      <LiveRegion message={countsMessage(counts)} />
    </div>
  );
}
