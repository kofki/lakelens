"use client";

import { cn } from "@/components/ui/cn";
import type { StateOption } from "./parkListUtils";

export interface StateControlProps {
  id: string;
  value: string | null;
  onChange: (state: string | null) => void;
  options: StateOption[];
  className?: string;
}

const ALL = "__all";

/**
 * State narrowing as a native <select>, the same control as Sort: a chip per state
 * would be a fifty-wide scroller, and the browser's own menu is already a 44px
 * target with keyboard and screen-reader behaviour we do not have to rebuild.
 * Renders nothing until the data spans more than one state.
 */
export function StateControl({ id, value, onChange, options, className }: StateControlProps) {
  if (options.length < 2) return null;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <label htmlFor={id} className="text-sm font-bold text-brown">
        State
      </label>
      <select
        id={id}
        value={value ?? ALL}
        onChange={(e) => onChange(e.target.value === ALL ? null : e.target.value)}
        className="min-h-11 rounded-full border border-mist bg-white px-3 text-sm font-bold text-brown shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-taupe"
      >
        <option value={ALL}>All states</option>
        {options.map((option) => (
          <option key={option.code} value={option.code}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );
}
