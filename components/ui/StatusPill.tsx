import type { StatusLevel } from "@/lib/types";
import { STATUS_META } from "@/lib/status";
import { StatusIcon } from "./StatusIcon";
import { cn } from "./cn";

export interface StatusPillProps {
  level: StatusLevel;
  size?: "sm" | "md" | "lg";
  /** Adds a visible "Estimate" badge inside the pill (never colour alone). */
  estimate?: boolean;
  className?: string;
}

/* Text colours all pass 4.5:1 on white (see app/globals.css). Background is solid white
 * so the pill stays legible when overlaid on photos or the cream page. */
const TONE: Record<StatusLevel, string> = {
  open: "text-status-open border-status-open/40",
  likely_full: "text-status-likely border-status-likely/40",
  full: "text-status-full border-status-full/40",
  closed: "text-status-closed border-status-closed/40",
  unknown: "text-status-unknown border-status-unknown/40",
};

const SIZE = {
  sm: { pill: "gap-1 px-2 py-0.5 text-xs", icon: "size-3.5" },
  md: { pill: "gap-1.5 px-2.5 py-1 text-sm", icon: "size-4" },
  lg: { pill: "gap-2 px-3.5 py-1.5 text-base", icon: "size-5" },
} as const;

/**
 * Park status as icon + text + colour. `sm` shows the short label visually and the
 * full label to screen readers.
 */
export function StatusPill({ level, size = "md", estimate = false, className }: StatusPillProps) {
  const meta = STATUS_META[level];
  const s = SIZE[size];
  const useShort = size === "sm" && meta.shortLabel !== "?";
  return (
    <span
      data-level={level}
      className={cn(
        "inline-flex max-w-full items-center rounded-full border bg-white font-bold leading-tight shadow-card",
        TONE[level],
        s.pill,
        className,
      )}
    >
      <StatusIcon level={level} className={s.icon} />
      {useShort ? (
        <>
          <span aria-hidden="true">{meta.shortLabel}</span>
          <span className="sr-only">{meta.label}</span>
        </>
      ) : (
        <span>{meta.label}</span>
      )}
      {estimate && (
        <span className="ml-0.5 rounded-full bg-mist/70 px-1.5 py-px text-[0.72em] font-extrabold uppercase tracking-wide text-cocoa">
          Estimate
        </span>
      )}
    </span>
  );
}
