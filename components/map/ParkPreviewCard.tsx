"use client";

import { useCallback, useEffect, useId, useRef, type CSSProperties, type KeyboardEvent } from "react";
import { MapPin, X } from "lucide-react";
import type { ParkWithStatus } from "@/lib/types";
import { STATUS_META } from "@/lib/status";
import { describeWeather, reportLine } from "@/lib/plainLanguage";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { StatRow } from "@/components/ui/StatRow";
import { StatusPill } from "@/components/ui/StatusPill";
import { cn } from "@/components/ui/cn";
import { ParkPhoto } from "@/components/list/ParkPhoto";
import { conditionStatItems, hasConditionData } from "@/components/list/conditionStats";
import { describeParkKind, formatDistance, statusSourceLabel } from "@/components/list/parkListUtils";

export interface ParkPreviewCardProps {
  item: ParkWithStatus;
  onClose: () => void;
  /** Reports the rendered height so the map can keep the marker above the card. */
  onHeightChange?: (px: number) => void;
  style?: CSSProperties;
  className?: string;
}

/**
 * The Figma "Spring Card": floats above the bottom sheet when a marker is selected.
 * Non-modal dialog: takes focus on open, Escape closes, the caller returns focus to the marker.
 */
export function ParkPreviewCard({ item, onClose, onHeightChange, style, className }: ParkPreviewCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const descId = useId();
  const { park, status, reportSummary } = item;
  const distance = formatDistance(item.distanceKm);
  const now = new Date();

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, [park.id]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !onHeightChange) return;
    onHeightChange(el.offsetHeight);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => onHeightChange(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeightChange, park.id]);

  // Escape works from anywhere on the page while the card is open (focus may be on the map).
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-labelledby={headingId}
      aria-describedby={descId}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      style={style}
      // Callers position the card (fixed above the sheet on phones, docked in the map
      // panel on desktop); the default is the floating phone placement.
      className={cn("z-20 outline-none", className ?? "absolute inset-x-3 mx-auto max-w-xl")}
    >
      <Card as="article" padded={false} className="overflow-hidden">
        <div className="flex gap-3 p-3">
          <ParkPhoto src={park.photo_url} className="size-24 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 id={headingId} className="text-lg font-extrabold leading-tight text-cocoa">
                  {park.name}
                </h2>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-mocha">
                  <span>{describeParkKind(park)}</span>
                  {distance && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-aqua px-2 py-0.5 font-bold text-cocoa">
                      <MapPin aria-hidden="true" focusable="false" className="size-3" />
                      {distance} away
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close preview"
                className="-mr-1 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-full text-cocoa hover:bg-mist/60"
              >
                <X aria-hidden="true" focusable="false" className="size-5" />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusPill level={status.level} size="md" estimate={status.isEstimate} />
              {reportSummary.sampleCount > 0 && <Badge variant="sample" />}
            </div>
          </div>
        </div>

        <div className="space-y-2 px-3">
          <p id={descId} className="text-sm text-cocoa">
            {status.reasons[0] ?? STATUS_META[status.level].description}
          </p>
          {reportSummary.signal !== "none" && (
            <p className="text-sm text-cocoa" suppressHydrationWarning>
              {reportLine(reportSummary, now)}
            </p>
          )}
          {hasConditionData(item) ? (
            <>
              <StatRow items={conditionStatItems(item)} />
              <p className="text-xs text-mocha">{describeWeather(item.weather)}</p>
            </>
          ) : (
            <p className="text-xs text-mocha">Live water and weather data not yet available for this park.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 p-3">
          <LastUpdated at={status.updatedAt} source={statusSourceLabel(status.source)} />
          <ButtonLink href={`/park/${park.slug}`} variant="primary">
            Open park page
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
