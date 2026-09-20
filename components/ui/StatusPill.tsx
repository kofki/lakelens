import type { ParkStatus, StatusLevel } from "@/lib/types";
import { STATUS_META } from "@/lib/status";
import { StatusIcon } from "./StatusIcon";
import { cn } from "./cn";

export interface StatusPillProps {
  level: StatusLevel;
  /** When given, a closure shows why: overnight, seasonal or an official notice. */
  source?: ParkStatus["source"];
  size?: "sm" | "md" | "lg";
  className?: string;
}

/* Pastel status pills: fill = STATUS_META.bgHex, text = STATUS_META.hex (all >= 6.6:1),
 * 1.5px edge = STATUS_META.edgeHex (>= 3:1 on white). Tokens live in app/globals.css. */
const TONE: Record<StatusLevel, string> = {
  open: "bg-status-open-bg text-status-open border-status-open-edge",
  full: "bg-status-full-bg text-status-full border-status-full-edge",
  closed: "bg-status-closed-bg text-status-closed border-status-closed-edge",
  unknown: "bg-status-unknown-bg text-status-unknown border-status-unknown-edge",
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
export function StatusPill({ level, source, size = "md", className }: StatusPillProps) {
  const meta = STATUS_META[level];
  const s = SIZE[size];
  const useShort = size === "sm" && meta.shortLabel !== "?";
  return (
    <span
      data-level={level}
      className={cn(
        "inline-flex max-w-full items-center rounded-full border-[1.5px] font-bold leading-tight",
        TONE[level],
        s.pill,
        className,
      )}
    >
      <StatusIcon level={level} source={source} className={s.icon} />
      {useShort ? (
        <>
          <span aria-hidden="true">{meta.shortLabel}</span>
          <span className="sr-only">{meta.label}</span>
        </>
      ) : (
        <span>{meta.label}</span>
      )}
    </span>
  );
}
