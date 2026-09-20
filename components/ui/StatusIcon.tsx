import { Ban, CalendarOff, CircleCheck, CircleHelp, Clock, Moon, OctagonX, type LucideIcon } from "lucide-react";
import type { ParkStatus, StatusLevel } from "@/lib/types";
import { STATUS_META, statusIconName, type StatusIconName } from "@/lib/status";
import { cn } from "./cn";

/** Status icon name -> lucide-react component. */
const ICONS: Record<StatusIconName, LucideIcon> = {
  CircleCheck,
  Clock,
  Ban,
  OctagonX,
  CircleHelp,
  Moon,
  CalendarOff,
};

export interface StatusIconProps {
  level: StatusLevel;
  /** When given, a closure shows why: a moon for overnight, a calendar for the season. */
  source?: ParkStatus["source"];
  className?: string;
}

/**
 * Decorative status glyph. Always rendered next to visible text (see StatusPill),
 * so it is aria-hidden here. Colour comes from the parent via `className`.
 */
export function StatusIcon({ level, source, className }: StatusIconProps) {
  const Icon = ICONS[source ? statusIconName({ level, source }) : STATUS_META[level].icon];
  return <Icon aria-hidden="true" focusable="false" strokeWidth={2.25} className={cn("shrink-0", className)} />;
}
