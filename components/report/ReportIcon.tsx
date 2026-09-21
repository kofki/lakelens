import {
  Accessibility,
  Anchor,
  Ban,
  Construction,
  DoorOpen,
  Droplets,
  SquareParking,
  SquareParkingOff,
  Toilet,
  TriangleAlert,
  Users,
  UsersRound,
  Waves,
  type LucideIcon,
} from "lucide-react";
import type { ReportValue } from "@/lib/types";

/**
 * One icon per report type. Every report surface pairs the icon with its own label, so
 * these are never the only thing carrying the meaning; they are there to make a grid of
 * thirteen similar-length phrases scannable.
 */
export const REPORT_VALUE_ICONS: Record<ReportValue, LucideIcon> = {
  got_in: DoorOpen,
  turned_away: Ban,
  line: Users,
  crowded: UsersRound,
  water_high: Waves,
  water_murky: Droplets,
  gator: TriangleAlert,
  launch_closed: Anchor,
  lot_full: SquareParkingOff,
  overflow_open: SquareParking,
  ramp_blocked: Construction,
  wheelchair_available: Accessibility,
  restroom_closed: Toilet,
};

export function ReportIcon({ value, className }: { value: ReportValue; className?: string }) {
  const Icon = REPORT_VALUE_ICONS[value];
  if (!Icon) return null;
  return <Icon aria-hidden="true" focusable="false" className={className} />;
}
