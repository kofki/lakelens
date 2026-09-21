/**
 * Frozen contract: the five park status levels and how they are shown.
 * Status is ALWAYS rendered as colour + icon + text (never colour alone).
 * `icon` is a lucide-react icon name; UI components resolve it.
 * This file must stay free of React / Next / map imports (used by lib tests).
 */
import type { ParkStatus, StatusLevel, StatusSource } from "./types";

/** Every glyph the status system can ask for. UI components resolve the name. */
export type StatusIconName = "CircleCheck" | "Clock" | "Ban" | "OctagonX" | "CircleHelp" | "Moon" | "CalendarOff";

export interface StatusMeta {
  label: string;
  shortLabel: string;
  /** Tailwind token name from app/globals.css, e.g. "status-open" */
  colorToken: string;
  /** Text colour hex (AA on the pill background). */
  hex: string;
  /** Pill and marker background hex (pastel). */
  bgHex: string;
  /** Border/marker edge hex (3:1 on white). */
  edgeHex: string;
  icon: StatusIconName;
  description: string;
}

/**
 * Whether we know anything about whether this place is open.
 *
 * False for a lake the harvest found by its public shore and nobody has recorded anything
 * about. Those are not parks that might be shut, they are bodies of water we can point at,
 * and a badge reading "Status unknown" still frames them as somewhere with opening hours
 * we happen to be missing. Nothing to say, so nothing is shown.
 */
export function hasKnownStatus(status: { level: StatusLevel; source: StatusSource }): boolean {
  return !(status.level === "unknown" && status.source === "unknown");
}

export const STATUS_META: Record<StatusLevel, StatusMeta> = {
  open: {
    label: "Open",
    shortLabel: "Open",
    colorToken: "status-open",
    hex: "#14532d",
    bgHex: "#dcfce7",
    edgeHex: "#16a34a",
    icon: "CircleCheck",
    description: "Letting visitors in right now.",
  },
  full: {
    label: "Full / turned away",
    shortLabel: "Full",
    colorToken: "status-full",
    hex: "#991b1b",
    bgHex: "#fee2e2",
    edgeHex: "#dc2626",
    icon: "Ban",
    description: "Visitors report being turned away at the gate.",
  },
  closed: {
    label: "Closed",
    shortLabel: "Closed",
    colorToken: "status-closed",
    hex: "#7f1d1d",
    bgHex: "#fecaca",
    edgeHex: "#7f1d1d",
    icon: "OctagonX",
    description: "An official notice says swimming is closed.",
  },
  unknown: {
    label: "Status unknown",
    shortLabel: "?",
    colorToken: "status-unknown",
    hex: "#374151",
    bgHex: "#eef0ea",
    edgeHex: "#6b7280",
    icon: "CircleHelp",
    description: "Not enough data yet.",
  },
};

export const STATUS_ORDER: StatusLevel[] = ["open", "full", "closed", "unknown"];


/**
 * The one-line description for a status, which depends on WHY it holds, not only on the
 * level.
 *
 * "Closed" covers an official notice, the swim season and simply being 2 a.m., and
 * STATUS_META can only speak for one of them: a park shut overnight was being described
 * as having an official notice against it, which is a different and much more alarming
 * claim.
 */
/**
 * The glyph for a status, which depends on WHY it holds.
 *
 * All three kinds of "closed" shared one stop sign, so on the map a park shut for the
 * night looked exactly like one an official notice had closed. They are very different
 * things to a person deciding whether to drive out tomorrow morning.
 */
export function statusIconName(status: Pick<ParkStatus, "level" | "source">): StatusIconName {
  if (status.level === "closed") {
    if (status.source === "hours") return "Moon";
    if (status.source === "seasonal") return "CalendarOff";
  }
  return STATUS_META[status.level].icon;
}

/**
 * Short label for a status, spelling out which kind of closure it is.
 *
 * Used where the glyph carries meaning on its own, such as a map marker's accessible
 * name: a moon and a calendar must not both read as "Closed".
 */
export function statusShortReason(status: Pick<ParkStatus, "level" | "source">): string {
  if (status.level === "closed") {
    if (status.source === "hours") return "Closed for the night";
    if (status.source === "seasonal") return "Closed for the season";
  }
  return STATUS_META[status.level].label;
}

export function statusDescription(status: Pick<ParkStatus, "level" | "source">): string {
  if (status.level === "closed") {
    if (status.source === "hours") return "Outside the park's opening hours.";
    if (status.source === "seasonal") return "Closed for the season.";
  }
  return STATUS_META[status.level].description;
}
