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
export function StatRow({ items, className }: StatRowProps) {
  return (
    <dl className={cn("grid grid-cols-3 gap-2", className)}>
      {items.map((it) => (
        <div key={it.label} className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-cream px-2.5 py-2">
          <dt className="flex items-center gap-1 text-xs font-bold text-cocoa/75">
            <span aria-hidden="true" className="inline-flex shrink-0 text-sunset [&>svg]:size-3.5">
              {it.icon}
            </span>
            <span className="truncate">{it.label}</span>
          </dt>
          <dd className="truncate text-sm font-extrabold text-cocoa">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
