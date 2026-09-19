"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Accessibility, Car, Compass } from "lucide-react";
import { DEFAULT_FILTERS, type BackupSuggestion, type ParkWithStatus } from "@/lib/types";
import { suggestBackups } from "@/lib/backups";
import { isAccessibleEntry, kmToMiles } from "@/lib/distance";
import { STATUS_META } from "@/lib/status";
import { Section } from "@/components/ui/Section";
import { StatusPill } from "@/components/ui/StatusPill";
import { Badge } from "@/components/ui/Badge";
import { Chip } from "@/components/ui/Chip";

export interface BackupSuggestionsProps {
  target: ParkWithStatus;
  all: ParkWithStatus[];
  initial: BackupSuggestion[];
}

/**
 * "This park is full → here's where you can still get in."
 * Server passes the default suggestions; if the user arrived with ?accessible=1
 * (or toggles the chip) we recompute with the accessible-entry filter.
 */
export function BackupSuggestions({ target, all, initial }: BackupSuggestionsProps) {
  const searchParams = useSearchParams();
  const [accessible, setAccessible] = useState(searchParams.get("accessible") === "1");

  const suggestions = useMemo(
    () => (accessible ? suggestBackups(target, all, { ...DEFAULT_FILTERS, accessibleEntry: true }) : initial),
    [accessible, target, all, initial],
  );

  if (!["full", "likely_full", "closed"].includes(target.status.level)) return null;

  const heading = target.status.level === "closed" ? "Closed — try one of these instead" : "Likely full — backup options nearby";

  return (
    <Section id="backups" title={heading} icon={<Compass aria-hidden="true" focusable="false" />}>
      <Chip
        selected={accessible}
        onClick={() => setAccessible((a) => !a)}
        icon={<Accessibility aria-hidden="true" focusable="false" className="h-4 w-4" />}
        ariaLabel="Only show parks with wheelchair-accessible water entry"
      >
        Accessible water entry
      </Chip>

      {suggestions.length === 0 ? (
        <p className="text-sm text-mocha">No nearby park with room{accessible ? " and accessible water entry" : ""} right now. Check the full list.</p>
      ) : (
        <ul className="space-y-2" aria-label="Backup parks">
          {suggestions.map((s) => {
            const href = `/park/${s.park.slug}${accessible ? "?accessible=1" : ""}`;
            return (
              <li key={s.park.id}>
                <Link
                  href={href}
                  className="block rounded-xl border border-mist bg-white p-3 hover:border-sand focus-visible:outline-sunset"
                  aria-label={`${s.park.name}: ${STATUS_META[s.status.level].label}, ${kmToMiles(s.distanceKm).toFixed(0)} miles, about ${s.driveMinutes} minutes`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-base font-extrabold text-cocoa">{s.park.name}</p>
                    <StatusPill level={s.status.level} size="sm" estimate={s.status.isEstimate} />
                  </div>
                  <p className="mt-1 text-sm text-mocha">
                    {kmToMiles(s.distanceKm).toFixed(0)} mi · about {s.driveMinutes} min drive
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-cocoa">
                    {s.parkingSummary && (
                      <span className="inline-flex items-center gap-1">
                        <Car aria-hidden="true" focusable="false" className="h-3.5 w-3.5" /> {s.parkingSummary}
                      </span>
                    )}
                    {isAccessibleEntry(s.accessibility) ? (
                      <Badge variant={s.accessibility?.verified ? "verified" : "unverified"}>
                        Accessible water entry{s.accessibility?.verified ? "" : " (unverified)"}
                      </Badge>
                    ) : (
                      <span className="text-mocha">Accessible entry: {s.accessibility ? "not stated" : "unknown"}</span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
