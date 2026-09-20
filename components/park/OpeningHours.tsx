import { Clock } from "lucide-react";
import type { Park } from "@/lib/types";
import { formatMinutes, getOpenState } from "@/lib/openingHours";
import { cn } from "@/components/ui/cn";

export interface OpeningHoursProps {
  park: Park;
  now: Date;
  className?: string;
}

/**
 * Hours the way every other place listing shows them: the state first, then the next
 * change.
 *
 * The curated text is a paragraph, because it is quoted from the park's page and covers
 * seasons, swim slots, concession stands and pancake houses. That belongs on the page, but
 * not where someone is asking the only question that matters at a glance: is it open, and
 * until when. When the hours cannot be parsed this falls back to the sentence rather than
 * claiming a state it cannot support.
 */
export function OpeningHours({ park, now, className }: OpeningHoursProps) {
  if (!park.hours) return null;
  const state = getOpenState(park, now);

  if (state.open === null) {
    return (
      <p className={cn("flex items-start gap-1.5 text-sm text-cocoa", className)}>
        <Clock aria-hidden="true" focusable="false" className="mt-0.5 size-4 shrink-0 text-taupe" />
        <span>{park.hours}</span>
      </p>
    );
  }

  const next = state.open
    ? state.closesMin != null && `Closes ${formatMinutes(state.closesMin)}`
    : state.opensMin != null && `Opens ${formatMinutes(state.opensMin)}`;

  return (
    <p className={cn("flex items-center gap-1.5 text-sm", className)}>
      <Clock aria-hidden="true" focusable="false" className="size-4 shrink-0 text-taupe" />
      <span className={cn("font-extrabold", state.open ? "text-status-open" : "text-status-full")}>
        {state.open ? "Open now" : "Closed now"}
      </span>
      {next && (
        <>
          <span aria-hidden="true" className="text-mocha">
            ·
          </span>
          <span className="text-cocoa">{next}</span>
        </>
      )}
    </p>
  );
}
