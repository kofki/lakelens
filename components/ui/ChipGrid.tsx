import type { ReactNode } from "react";
import { Check, X } from "lucide-react";
import { cn } from "./cn";

export interface ChipItem {
  label: string;
  /** true = allowed/present, false = not allowed/absent, null = unknown (chip is dropped). */
  state: boolean | null;
  icon?: ReactNode;
  /** Extra detail on hover, e.g. a fee or a rule reference. */
  title?: string;
}

export interface ChipGridProps {
  items: ChipItem[];
  className?: string;
}

/**
 * Rules and amenities as ✓/✕ pills instead of a definition list.
 *
 * Items with `state: null` are dropped rather than rendered as "Not stated". A park we
 * have not researched simply shows fewer chips, which reads as a shorter list rather than
 * as a worse park.
 */
export function ChipGrid({ items, className }: ChipGridProps) {
  const known = items.filter((i) => i.state !== null);
  if (known.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap gap-2", className)}>
      {known.map((item) => (
        <li key={item.label}>
          <span
            title={item.title}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-bold [&>svg]:size-4",
              item.state
                ? "border-mist bg-cream text-cocoa"
                : "border-status-full-edge/35 bg-status-full-bg/50 text-status-full",
            )}
          >
            {item.icon ?? (item.state ? <Check aria-hidden="true" focusable="false" /> : <X aria-hidden="true" focusable="false" />)}
            {item.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
