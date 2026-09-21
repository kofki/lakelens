import type { ParkBundle } from "@/lib/types";
import { statusDescription, hasKnownStatus } from "@/lib/status";
import {formatLocalTime, relativeTime} from "@/lib/freshness";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { StatusPill } from "@/components/ui/StatusPill";
import {STATUS_SOURCE_TEXT, newestIso} from "./format";

export type { SectionLink } from "./SectionTabs";

export interface StatusHeaderProps {
  bundle: ParkBundle;
  now: Date;
  /** @deprecated Jump links now live in <SectionTabs>; this prop is ignored. */
  sections?: import("./SectionTabs").SectionLink[];
}

/** Data sources that fed this page, for the "Sourced from …" line. */
function sourcesLine(bundle: ParkBundle): string {
  const parts: string[] = [];
  const stateParks = bundle.park.state ? `${bundle.park.state} State Parks` : "the state park system";
  const operator = bundle.park.operator === "state" ? stateParks : bundle.park.operator === "county" ? "the county park office" : "the park operator";
  parts.push(operator);
  if (bundle.usgs) parts.push("USGS");
  if (bundle.weather) parts.push("National Weather Service");
  if (bundle.reportSummary.count > 0) parts.push("visitor reports");
  return parts.join(" · ");
}

/**
 * Status pill, plain-language evidence, one attribution line.
 *
 * Status is always icon plus text, and the "Estimate" badge appears whenever the level is
 * inferred rather than reported. There is no coverage label: a park we know less about
 * simply shows fewer reasons. On md+ the pill sits beside the title in <Hero>, so here it
 * is phone-only.
 */
export function StatusHeader({ bundle, now }: StatusHeaderProps) {
  const { status } = bundle;
  const conditionsAt = newestIso(bundle.usgsFetchedAt, bundle.weatherFetchedAt);

  return (
    <section
      id="status"
      aria-labelledby="status-heading"
      className="scroll-mt-4 space-y-4 rounded-card border border-mist-light bg-white p-4 shadow-card"
    >
      <h2 id="status-heading" className="sr-only">
        Status
      </h2>
      <div className="flex flex-wrap items-center gap-2 md:hidden">
        {hasKnownStatus(status) && <StatusPill level={status.level} source={status.source} size="lg" />}
      </div>

      <p className="text-base text-cocoa md:text-lg md:font-bold">{statusDescription(status)}</p>

      {status.predictedTime && status.level === "open" && (
        <p className="text-sm font-bold text-cocoa">
          Usually busiest from {formatLocalTime(status.predictedTime, bundle.park.time_zone || undefined)}. Arrive earlier if you can.
        </p>
      )}

      {status.reasons.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-taupe">Why we say this</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-cocoa">
            {status.reasons.map((r, i) => (
              <li key={`${i}-${r}`}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-1 border-t border-mist pt-3">
        <LastUpdated at={status.updatedAt} source={STATUS_SOURCE_TEXT[status.source]} prefix="Status updated" />
        <p className="text-xs text-mocha">
          Sourced from {sourcesLine(bundle)}
          {conditionsAt && (
            <>
              {" \u00b7 "}
              <time dateTime={conditionsAt}>{relativeTime(conditionsAt, now)}</time>
            </>
          )}
        </p>
      </div>
    </section>
  );
}
