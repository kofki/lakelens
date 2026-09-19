import type { ParkBundle } from "@/lib/types";
import { STATUS_META } from "@/lib/status";
import { formatLocalDate, formatLocalTime, relativeTime } from "@/lib/freshness";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { StatusPill } from "@/components/ui/StatusPill";
import { Badge } from "@/components/ui/Badge";
import { CONFIDENCE_TEXT, STATUS_SOURCE_TEXT, newestIso } from "./format";

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
  const operator = bundle.park.operator === "state" ? "Florida State Parks" : bundle.park.operator === "county" ? "the county park office" : "the park operator";
  parts.push(operator);
  if (bundle.usgs) parts.push("USGS");
  if (bundle.weather) parts.push(bundle.weather.provider === "nws" ? "National Weather Service" : "Open-Meteo");
  if (bundle.reportSummary.count > 0) parts.push("visitor reports");
  return parts.join(" · ");
}

/**
 * Status pill + plain-language evidence + attribution line.
 * Status is always icon + text; the "Estimate" badge appears whenever the level is inferred.
 * On md+ the pill also sits beside the title in <Hero>, so here it is phone-only.
 */
export function StatusHeader({ bundle, now }: StatusHeaderProps) {
  const { status, park } = bundle;
  // Basic-tier parks often still have live water data (a nearby USGS gauge or NOAA station).
  const hasWaterData = Boolean(bundle.usgs || bundle.noaa);
  const conditionsAt = newestIso(bundle.usgsFetchedAt, bundle.weatherFetchedAt);
  const meta = STATUS_META[status.level];

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
        <StatusPill level={status.level} size="lg" estimate={status.isEstimate} />
        <span className="text-sm font-bold text-mocha">{CONFIDENCE_TEXT[status.confidence]}</span>
      </div>

      <p className="text-base text-cocoa md:text-lg md:font-bold">{meta.description}</p>

      {status.predictedTime && status.level === "open" && (
        <p className="text-sm font-bold text-cocoa">
          Usually fills around {formatLocalTime(status.predictedTime)} — arrive earlier to be safe{" "}
          <Badge variant="estimate" className="ml-1 align-middle" />
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
          {conditionsAt ? (
            <>
              {" "}
              · Conditions as of{" "}
              <time dateTime={conditionsAt}>
                {formatLocalDate(conditionsAt)}, {formatLocalTime(conditionsAt)}
              </time>{" "}
              ({relativeTime(conditionsAt, now)})
            </>
          ) : (
            <> · No live conditions yet</>
          )}
        </p>
        {park.coverage_tier === "basic" && (
          <p className="text-xs text-mocha">
            Basic coverage: we have not curated a closure estimate for this park yet
            {hasWaterData ? ", but live conditions below are real." : ", and it has no live water gauge nearby."}
          </p>
        )}
      </div>
    </section>
  );
}
