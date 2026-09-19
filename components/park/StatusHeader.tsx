import type { ParkBundle } from "@/lib/types";
import { STATUS_META } from "@/lib/status";
import { formatLocalDate, formatLocalTime, relativeTime } from "@/lib/freshness";
import { Card } from "@/components/ui/Card";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { StatusPill } from "@/components/ui/StatusPill";
import { Badge } from "@/components/ui/Badge";
import { STATUS_SOURCE_TEXT, newestIso } from "./format";

export interface SectionLink {
  id: string;
  label: string;
}

export interface StatusHeaderProps {
  bundle: ParkBundle;
  now: Date;
  sections: SectionLink[];
}

const CONFIDENCE_TEXT = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
} as const;

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
 * Status pill + plain-language evidence + attribution line + section jump links.
 * Status is always icon + text; the "Estimate" badge appears whenever the level is inferred.
 */
export function StatusHeader({ bundle, now, sections }: StatusHeaderProps) {
  const { status, park } = bundle;
  const conditionsAt = newestIso(bundle.usgsFetchedAt, bundle.weatherFetchedAt);
  const meta = STATUS_META[status.level];

  return (
    <Card as="section" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill level={status.level} size="lg" estimate={status.isEstimate} />
        <span className="text-sm font-bold text-cocoa/75">{CONFIDENCE_TEXT[status.confidence]}</span>
      </div>

      <p className="text-base text-cocoa">{meta.description}</p>

      {status.predictedTime && status.level === "likely_full" && (
        <p className="text-sm font-bold text-cocoa">
          Expected to fill around {formatLocalTime(status.predictedTime)}{" "}
          <Badge variant="estimate" className="ml-1 align-middle" />
        </p>
      )}

      {status.reasons.length > 0 && (
        <div>
          <h2 className="text-sm font-extrabold text-cocoa/75">Why we say this</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-cocoa">
            {status.reasons.map((r, i) => (
              <li key={`${i}-${r}`}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-1 border-t border-mist pt-3">
        <LastUpdated at={status.updatedAt} source={STATUS_SOURCE_TEXT[status.source]} prefix="Status updated" />
        <p className="text-xs text-cocoa/75">
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
          <p className="text-xs text-cocoa/75">
            Basic coverage: closure estimates and live water data are not yet available for this park.
          </p>
        )}
      </div>

      {sections.length > 0 && (
        <nav aria-label="Sections on this page" className="-mx-4 overflow-x-auto px-4">
          <ul className="flex gap-2 pb-1">
            {sections.map((s) => (
              <li key={s.id} className="shrink-0">
                <a
                  href={`#${s.id}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-mist bg-cream px-4 text-sm font-bold text-cocoa hover:bg-mist/40"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </Card>
  );
}
