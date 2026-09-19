import { Ban, CircleCheck, CircleHelp, Clock, OctagonX, type LucideIcon } from "lucide-react";
import type { StatusLevel } from "@/lib/types";
import { STATUS_META, type StatusMeta } from "@/lib/status";
import { cn } from "./cn";

/** STATUS_META.icon name -> lucide-react component. */
const ICONS: Record<StatusMeta["icon"], LucideIcon> = {
  CircleCheck,
  Clock,
  Ban,
  OctagonX,
  CircleHelp,
};

export interface StatusIconProps {
  level: StatusLevel;
  className?: string;
}

/**
 * Decorative status glyph. Always rendered next to visible text (see StatusPill),
 * so it is aria-hidden here. Colour comes from the parent via `className`.
 */
export function StatusIcon({ level, className }: StatusIconProps) {
  const Icon = ICONS[STATUS_META[level].icon];
  return <Icon aria-hidden="true" focusable="false" strokeWidth={2.25} className={cn("shrink-0", className)} />;
}
