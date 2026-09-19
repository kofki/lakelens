import { Clock, TriangleAlert } from "lucide-react";
import { relativeTime } from "@/lib/freshness";
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
 * Uses lib/freshness.relativeTime against the render time; pages revalidate every 60 s.
 */
export function LastUpdated({ at, source, stale = false, prefix = "Updated", className }: LastUpdatedProps) {
  const now = new Date();
  const rel = at ? relativeTime(at, now) : null;
  return (
    <p className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-cocoa/75", className)}>
      {stale ? (
        <TriangleAlert aria-hidden="true" focusable="false" className="size-3.5 shrink-0 text-status-likely" />
      ) : (
        <Clock aria-hidden="true" focusable="false" className="size-3.5 shrink-0" />
      )}
      {at && rel ? (
        <span>
          {prefix} <time dateTime={at}>{rel}</time>
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
