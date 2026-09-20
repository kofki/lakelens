import Link from "next/link";
import { MapPin } from "lucide-react";
import type { ParkWithStatus } from "@/lib/types";
import { reportLine } from "@/lib/plainLanguage";
import { Badge } from "@/components/ui/Badge";
import { StatusPill } from "@/components/ui/StatusPill";
import { ParkPhoto } from "./ParkPhoto";
import { describeParkKind, formatDistance } from "./parkListUtils";

export interface ParkTileProps {
  item: ParkWithStatus;
}

/**
 * Photo tile for the /list grid (tablet and up). The park name is the
 * link and stretches over the whole tile; the status pill stays icon + text on a solid
 * white pill so it is legible over any photo (never colour alone).
 *
 * Layering: the photo is `-z-10` inside an isolated stacking context so the in-flow
 * frosted bar (not positioned) paints above it and the name link's ::after can use
 * the <article> as its containing block.
 */
export function ParkTile({ item }: ParkTileProps) {
  const { park, status, reportSummary } = item;
  const distance = formatDistance(item.distanceKm);
  return (
    <article
      className={
        "group relative isolate flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-[20px] bg-mist p-2.5 " +
        "shadow-card transition-[transform,box-shadow] duration-300 " +
        "hover:-translate-y-1.5 hover:shadow-card-hover " +
        "focus-within:-translate-y-1.5 focus-within:shadow-card-hover"
      }
    >
      <ParkPhoto
        src={park.photo_url}
        variant="tile"
        className="absolute inset-0 -z-10 size-full transition-transform duration-500 group-hover:scale-105"
      />

      <StatusPill level={status.level} size="sm" className="absolute left-3 top-3" />

      {distance && (
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-aqua/95 px-2.5 py-1 text-xs font-bold text-cyan-deep shadow-card backdrop-blur">
          <MapPin aria-hidden="true" focusable="false" className="size-3.5" />
          {distance}
          <span className="sr-only"> away</span>
        </span>
      )}

      <div className="rounded-[14px] bg-white/90 px-3 py-2 backdrop-blur-xl">
        <h3 className="truncate text-[0.95rem] font-extrabold leading-tight text-ink">
          <Link href={`/park/${park.slug}`} className="after:absolute after:inset-0 after:rounded-[20px]">
            {park.name}
          </Link>
        </h3>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-mocha">
          <span>{describeParkKind(park)}</span>
          <span aria-hidden="true">·</span>
          <span suppressHydrationWarning>
            {reportSummary.signal !== "none" ? reportLine(reportSummary, new Date()) : "No reports"}
          </span>
          {reportSummary.sampleCount > 0 && <Badge variant="sample" />}
        </p>
      </div>
    </article>
  );
}
