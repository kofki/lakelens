import Link from "next/link";
import { MapPin } from "lucide-react";
import type { ParkWithStatus } from "@/lib/types";
import { reportLine } from "@/lib/plainLanguage";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { StatRow } from "@/components/ui/StatRow";
import { StatusPill } from "@/components/ui/StatusPill";
import { ParkPhoto } from "./ParkPhoto";
import { conditionStatItems, hasConditionData } from "./conditionStats";
import { describeParkKind, formatDistance, statusSourceLabel } from "./parkListUtils";

export interface ParkCardProps {
  item: ParkWithStatus;
}

/**
 * List card. The park name is the link and stretches over the whole card
 * (::after inset-0), so the card is one tap target with a clean accessible name
 * while the status, stats and freshness stay readable as normal text.
 */
export function ParkCard({ item }: ParkCardProps) {
  const { park, status, reportSummary } = item;
  const distance = formatDistance(item.distanceKm);
  return (
    <Card as="article" padded={false} className="relative overflow-hidden transition-shadow focus-within:shadow-sheet hover:shadow-sheet">
      <div className="flex gap-3 p-3">
        <ParkPhoto src={park.photo_url} className="size-20 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-extrabold leading-tight text-cocoa">
            <Link href={`/park/${park.slug}`} className="after:absolute after:inset-0 after:rounded-card">
              {park.name}
            </Link>
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-mocha">
            <span>{describeParkKind(park)}</span>
            {distance && (
              <span className="inline-flex items-center gap-1 font-bold text-cocoa">
                <MapPin aria-hidden="true" focusable="false" className="size-3" />
                {distance}
              </span>
            )}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusPill level={status.level} size="sm" estimate={status.isEstimate} />
            {reportSummary.sampleCount > 0 && <Badge variant="sample" />}
            {park.coverage_tier === "basic" && <Badge variant="info">Basic info</Badge>}
          </div>
        </div>
      </div>
      <div className="space-y-1.5 border-t border-mist/60 px-3 py-2">
        {hasConditionData(item) ? (
          <StatRow items={conditionStatItems(item)} />
        ) : (
          <p className="text-xs text-mocha">Live water and weather data not yet available for this park.</p>
        )}
        {reportSummary.signal !== "none" && (
          <p className="text-xs text-cocoa" suppressHydrationWarning>
            {reportLine(reportSummary, new Date())}
          </p>
        )}
        <LastUpdated at={status.updatedAt} source={statusSourceLabel(status.source)} />
      </div>
    </Card>
  );
}
