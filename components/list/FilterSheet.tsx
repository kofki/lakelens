"use client";

import { useId, type ReactNode } from "react";
import { Accessibility, LocateFixed, ShieldCheck } from "lucide-react";
import { DEFAULT_FILTERS, type Filters } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { ModalSheet } from "@/components/sheet/ModalSheet";
import { SortControl } from "./SortControl";
import type { SortKey } from "./parkListUtils";

export interface FilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  sort: SortKey;
  onSortChange: (sort: SortKey) => void;
  hasLocation: boolean;
  /** Optional: shows a "Use my location" button that asks for permission. */
  onRequestLocation?: () => void;
  locationMessage?: string | null;
  resultCount: number;
}

function ToggleRow({
  id,
  checked,
  onChange,
  icon,
  label,
  hint,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon: ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-tile border border-mist-light bg-white px-3 py-2 shadow-card">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-6 shrink-0 accent-brown"
      />
      <span aria-hidden="true" className="inline-flex shrink-0 text-taupe [&>svg]:size-5">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-bold text-ink">{label}</span>
        <span className="block text-xs text-mocha">{hint}</span>
      </span>
    </label>
  );
}

/** Modal filter + sort sheet (vaul). Same three filters as the chips, with explanations. */
export function FilterSheet({
  open,
  onOpenChange,
  filters,
  onFiltersChange,
  sort,
  onSortChange,
  hasLocation,
  onRequestLocation,
  locationMessage,
  resultCount,
}: FilterSheetProps) {
  const base = useId();
  const set = (key: keyof Filters) => (checked: boolean) => onFiltersChange({ ...filters, [key]: checked });
  return (
    <ModalSheet open={open} onOpenChange={onOpenChange} title="Filters and sort" description="Narrow the list of parks.">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold text-brown">Show only</legend>
        <ToggleRow
          id={`${base}-accessible`}
          checked={filters.accessibleEntry}
          onChange={set("accessibleEntry")}
          icon={<Accessibility aria-hidden="true" focusable="false" />}
          label="Accessible water entry"
          hint="A ramp or dock ladder into the water, or a beach wheelchair to borrow"
        />
        <ToggleRow
          id={`${base}-guarded`}
          checked={filters.guardedOnly}
          onChange={set("guardedOnly")}
          icon={<ShieldCheck aria-hidden="true" focusable="false" />}
          label="Lifeguard on duty"
          hint="Only parks that list a lifeguard (most freshwater swim areas have none)"
        />
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <SortControl id={`${base}-sort`} value={sort} onChange={onSortChange} hasLocation={hasLocation} />
        {!hasLocation && onRequestLocation && (
          <Button variant="secondary" onClick={onRequestLocation}>
            <LocateFixed aria-hidden="true" focusable="false" />
            Use my location
          </Button>
        )}
      </div>
      {locationMessage && <p className="mt-2 text-xs text-mocha">{locationMessage}</p>}

      <div className="mt-5 flex gap-2">
        <Button
          variant="ghost"
          onClick={() => onFiltersChange({ ...DEFAULT_FILTERS })}
          disabled={!filters.accessibleEntry && !filters.guardedOnly}
        >
          Clear filters
        </Button>
        <Button variant="primary" full onClick={() => onOpenChange(false)}>
          Show {resultCount} {resultCount === 1 ? "park" : "parks"}
        </Button>
      </div>
    </ModalSheet>
  );
}
