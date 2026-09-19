import { Clock, TriangleAlert } from "lucide-react";
import { RelativeTime } from "./RelativeTime";
import { cn } from "./cn";

export interface LastUpdatedProps {
  /** ISO timestamp, or null when unknown. */
  at: string | null;
  /** e.g. "USGS", "National Weather Service", "Florida State Parks". */
  source?: string;
  /** Adds a visible "May be out of date" warning (icon + text). */
  stale?: boolean;
  /** Default "Updated". */
  prefix?: string;
  className?: string;
}

/**
 * "Updated 25 min ago · USGS". Every data point in LakeLens carries one of these.
 * The relative time is rendered by <RelativeTime>, which is hydration-safe and ticks.
 */
export function LastUpdated({ at, source, stale = false, prefix = "Updated", className }: LastUpdatedProps) {
  return (
    <p className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-cocoa/75", className)}>
      {stale ? (
        <TriangleAlert aria-hidden="true" focusable="false" className="size-3.5 shrink-0 text-status-likely" />
      ) : (
        <Clock aria-hidden="true" focusable="false" className="size-3.5 shrink-0" />
      )}
      {at ? (
        <span>
          {prefix} <RelativeTime at={at} />
        </span>
      ) : (
        <span>Last update unknown</span>
      )}
      {source && (
        <>
          <span aria-hidden="true">·</span>
          <span>{source}</span>
        </>
      )}
      {stale && <span className="font-bold text-status-likely">May be out of date</span>}
    </p>
  );
}
