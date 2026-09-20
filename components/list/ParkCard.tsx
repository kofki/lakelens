"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { MapPin } from "lucide-react";
import type { ParkWithStatus } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { StatRow } from "@/components/ui/StatRow";
import { Score } from "@/components/ui/RatingStars";
import { StatusPill } from "@/components/ui/StatusPill";
import { cn } from "@/components/ui/cn";
import { ParkPhoto } from "./ParkPhoto";
import { conditionStatItems } from "./conditionStats";
import { describeParkKind, formatDistance, statusSourceLabel } from "./parkListUtils";

export interface ParkCardProps {
  item: ParkWithStatus;
  /** Highlighted (aria-current + amber ring) and scrolled into view when true. */
  selected?: boolean;
  /**
   * When provided (desktop split view) clicking the card selects the park on the map
   * and only the name link navigates; without it the name link stretches over the
   * whole card (one tap target on phones).
   */
  onSelect?: (id: string) => void;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * List card. The park name is the link and stretches over the whole card
 * (::after inset-0), so the card is one tap target with a clean accessible name
 * while the status, stats and freshness stay readable as normal text.
 */
export function ParkCard({ item, selected = false, onSelect }: ParkCardProps) {
  const { park, status, reportSummary } = item;
  const distance = formatDistance(item.distanceKm);
  const ref = useRef<HTMLDivElement>(null);
  const selectable = typeof onSelect === "function";

  useEffect(() => {
    if (!selected) return;
    ref.current?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [selected]);

  return (
    <div
      ref={ref}
      aria-current={selected ? "true" : undefined}
      onClick={selectable ? () => onSelect(park.id) : undefined}
      className={cn("rounded-card", selectable && "cursor-pointer", selected && "ring-2 ring-sunset ring-offset-2 ring-offset-white")}
    >
      <Card as="article" padded={false} interactive className="relative overflow-hidden">
        <div className="flex gap-3 p-3">
          {/* The photo is a link in its own right: people tap pictures. */}
          <Link
            href={`/park/${park.slug}`}
            onClick={selectable ? (e) => e.stopPropagation() : undefined}
            tabIndex={-1}
            aria-hidden="true"
            className="shrink-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-taupe"
          >
            <ParkPhoto src={park.photo_url} className="size-20 shrink-0 rounded-xl" />
          </Link>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-extrabold leading-tight text-ink">
              <Link
                href={`/park/${park.slug}`}
                onClick={selectable ? (e) => e.stopPropagation() : undefined}
                className={selectable ? "underline-offset-4 hover:underline" : "after:absolute after:inset-0 after:rounded-card"}
              >
                {park.name}
              </Link>
            </h3>
            {item.reviewStats && item.reviewStats.averageRating != null && (
              <Score
                average={item.reviewStats.averageRating}
                count={item.reviewStats.reviewCount}
                sampleCount={item.reviewStats.sampleCount}
                size="sm"
                className="mt-0.5"
              />
            )}
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-mocha">
              <span>{describeParkKind(park)}</span>
              {distance && (
                <span className="inline-flex items-center gap-1 rounded-full bg-aqua px-2 py-0.5 font-bold text-cyan-deep">
                  <MapPin aria-hidden="true" focusable="false" className="size-3" />
                  {distance}
                </span>
              )}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <StatusPill level={status.level} size="sm" />
              {reportSummary.sampleCount > 0 && <Badge variant="sample" />}
            </div>
          </div>
        </div>
        <div className="space-y-1.5 border-t border-mist-light px-3 py-2">
          <StatRow items={conditionStatItems(item)} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <LastUpdated at={status.updatedAt} source={statusSourceLabel(status.source)} />
            {selectable && (
              <button
                type="button"
                aria-pressed={selected}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(park.id);
                }}
                className="inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-xs font-bold text-brown hover:bg-mist-light"
              >
                <MapPin aria-hidden="true" focusable="false" className="size-3.5" />
                Show on map
                <span className="sr-only">: {park.name}</span>
              </button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
