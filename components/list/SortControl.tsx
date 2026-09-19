"use client";

import { cn } from "@/components/ui/cn";
import { isSortKey, type SortKey } from "./parkListUtils";

export interface SortControlProps {
  id: string;
  value: SortKey;
  onChange: (sort: SortKey) => void;
  /** Distance sorting needs a location; the option stays visible but disabled without one. */
  hasLocation: boolean;
  className?: string;
}

/** Native <select>: the most robust 44px control on phones and with screen readers. */
export function SortControl({ id, value, onChange, hasLocation, className }: SortControlProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <label htmlFor={id} className="text-sm font-bold text-cocoa">
        Sort
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          if (isSortKey(e.target.value)) onChange(e.target.value);
        }}
        className="min-h-11 rounded-full border border-mist bg-white px-3 text-sm font-bold text-cocoa shadow-card"
      >
        <option value="distance" disabled={!hasLocation}>
          {hasLocation ? "Nearest first" : "Nearest first (needs location)"}
        </option>
        <option value="status">Open first</option>
        <option value="name">Name A–Z</option>
      </select>
    </div>
  );
}
