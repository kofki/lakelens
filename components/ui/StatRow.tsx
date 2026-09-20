import type { ReactNode } from "react";
import { cn } from "./cn";

export interface StatRowItem {
  icon: ReactNode;
  label: string;
  value: string;
}

export interface StatRowProps {
  items: StatRowItem[];
  className?: string;
}

/** Compact 3-stat row for cards (water temp / flow / weather). Rendered as a definition list. */
const COLUMNS: Record<number, string> = { 0: "grid-cols-1", 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" };

export function StatRow({ items, className }: StatRowProps) {
  if (items.length === 0) return null;
  return (
    // Columns follow the item count: a park with two readings gets two even columns
    // rather than a three-column grid with a hole where the third used to be.
    <dl className={cn("grid gap-2", COLUMNS[Math.min(items.length, 3)] ?? COLUMNS[3], className)}>
      {items.map((it) => (
        <div key={it.label} className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-mist-light bg-cream px-2.5 py-2">
          <dt className="flex items-center gap-1 text-xs font-bold text-mocha">
            <span aria-hidden="true" className="inline-flex shrink-0 text-taupe [&>svg]:size-3.5">
              {it.icon}
            </span>
            <span className="truncate">{it.label}</span>
          </dt>
          <dd className="truncate text-sm font-extrabold text-ink">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
