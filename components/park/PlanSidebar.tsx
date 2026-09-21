import {Accessibility as AccessibilityIcon, CalendarCheck, DollarSign, ExternalLink, Navigation} from "lucide-react";
import type { ParkBundle, Prediction } from "@/lib/types";
import { statusDescription, hasKnownStatus } from "@/lib/status";
import { isAccessibleEntry } from "@/lib/distance";
import { OpeningHours } from "./OpeningHours";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { StatusPill } from "@/components/ui/StatusPill";
import { ParkingMapLazy } from "@/components/map/ParkingMapLazy";
import { directionsUrl } from "@/components/map/directions";
import { ReportButton } from "@/components/report/ReportButton";
import { STATUS_SOURCE_TEXT } from "./format";

export interface PlanSidebarProps {
  bundle: ParkBundle;
  /** Injected rather than read here so the server and the client agree on "now". */
  now: Date;
  className?: string;
}

const PREDICTION_LINE: Record<Prediction["level"], string> = {
  none: "About as busy as usual",
  possible: "Busier than usual today",
  likely: "Much busier than usual today",
  closed: "Closed today",
};

/** One plain-language line under the status pill: the forecast when we have one, else the status description. */
function summaryLine(bundle: ParkBundle): string {
  const { status, prediction, park } = bundle;
  if (status.source === "alert" || status.source === "seasonal" || status.source === "confirmed_reports") {
    return statusDescription(status);
  }
  if (park.coverage_tier === "deep" && prediction) {
    if (prediction.predictedTimeLabel && prediction.level !== "none") {
      return `Usually busiest ${prediction.predictedTimeLabel}`;
    }
    return PREDICTION_LINE[prediction.level];
  }
  return statusDescription(status);
}

/**
 * Desktop-only (lg+) sticky "Plan your visit" column: status at a glance, report button,
 * directions / reservation / official links, hours and fees, a mini map and the
 * accessibility one-liner. Everything here also appears in the main column, so phones lose nothing.
 */
export function PlanSidebar({ bundle, now, className }: PlanSidebarProps) {
  const { park, status, accessibility } = bundle;
  const line = summaryLine(bundle);
  const accessible = isAccessibleEntry(accessibility);
  const accessText = !accessibility
    ? "not stated"
    : accessible
      ? "yes"
      : accessibility.water_access === "limited"
        ? "limited"
        : accessibility.water_access === "no"
          ? "no"
          : "not stated";

  return (
    <aside aria-label="Plan your visit" className={className}>
      <Card as="section" className="space-y-3">
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-taupe">Plan your visit</h2>
        {hasKnownStatus(status) && (
          <>
            <StatusPill level={status.level} source={status.source} size="lg" />
            <p className="text-sm font-bold text-cocoa">{line}</p>
            <LastUpdated at={status.updatedAt} source={STATUS_SOURCE_TEXT[status.source]} prefix="Status updated" />
          </>
        )}

        <div className="space-y-2 pt-1">
          <ReportButton park={park} full size="md" />
          <ButtonLink
            href={directionsUrl(park.lat, park.lng, park.name)}
            target="_blank"
            rel="noopener noreferrer"
            variant="secondary"
            full
          >
            <Navigation aria-hidden="true" focusable="false" />
            Get directions
            <span className="sr-only">(opens in a new tab)</span>
          </ButtonLink>
          {park.reservation_required && park.reservation_url && (
            <ButtonLink href={park.reservation_url} target="_blank" rel="noopener noreferrer" variant="secondary" full>
              <CalendarCheck aria-hidden="true" focusable="false" />
              Reserve day-use entry
              <span className="sr-only">(opens in a new tab)</span>
            </ButtonLink>
          )}
        </div>

        <OpeningHours park={park} now={now} />

        {park.fees && (
          <dl className="divide-y divide-mist border-t border-mist text-sm">
            {park.fees && (
              <div className="flex gap-3 py-2">
                <dt className="flex w-16 shrink-0 items-center gap-1 font-bold text-mocha">
                  <DollarSign aria-hidden="true" focusable="false" className="size-4" /> Fees
                </dt>
                <dd className="text-cocoa">{park.fees}</dd>
              </div>
            )}
          </dl>
        )}

        {park.official_url && (
          <a
            href={park.official_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-brown underline underline-offset-2"
          >
            Official park page
            <ExternalLink aria-hidden="true" focusable="false" className="size-4" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </Card>

      <Card as="section" className="space-y-3 border-mist">
        <h2 className="text-lg font-extrabold leading-tight text-brown">Where you&apos;ll be</h2>
        <ParkingMapLazy center={{ lat: park.lat, lng: park.lng }} parkName={park.name} lots={bundle.parkingLots} className="w-full" />
      </Card>

      <Card as="section" className="flex items-start gap-2">
        <AccessibilityIcon aria-hidden="true" focusable="false" className="mt-0.5 size-5 shrink-0 text-taupe" />
        <p className="text-sm text-cocoa">
          <span className="font-bold">Accessible water entry:</span> {accessText}{" "}
          {accessibility && (
            <Badge variant={accessibility.verified ? "verified" : "unverified"} className="ml-1 align-middle" />
          )}
        </p>
      </Card>
    </aside>
  );
}
