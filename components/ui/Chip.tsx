"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "./cn";

export interface ChipProps {
  selected?: boolean;
  onClick?: () => void;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}

/**
 * Toggle pill (filters, one-tap report values). Exposes state via aria-pressed and
 * a check mark, not colour alone. 44px minimum height. Selected = forest green fill.
 */
export function Chip({ selected = false, onClick, icon, children, className, ariaLabel }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-bold leading-tight transition-colors [&>svg]:size-4 [&>svg]:shrink-0",
        selected
          ? "border-brown bg-brown text-white"
          : "border-mist bg-white text-mocha hover:border-brown hover:text-brown active:bg-mist-light",
        className,
      )}
    >
      {selected ? (
        <Check aria-hidden="true" focusable="false" strokeWidth={2.5} />
      ) : (
        icon && (
          <span aria-hidden="true" className="inline-flex shrink-0 [&>svg]:size-4">
            {icon}
          </span>
        )
      )}
      <span>{children}</span>
    </button>
  );
}
