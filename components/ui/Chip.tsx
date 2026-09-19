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
 * a check mark, not colour alone. 44px minimum height.
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
          ? "border-cocoa bg-cocoa text-cream"
          : "border-mist bg-white text-cocoa shadow-card hover:bg-cream active:bg-mist/40",
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
