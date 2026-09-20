/**
 * Frozen contract: the five park status levels and how they are shown.
 * Status is ALWAYS rendered as colour + icon + text (never colour alone).
 * `icon` is a lucide-react icon name; UI components resolve it.
 * This file must stay free of React / Next / map imports (used by lib tests).
 */
import type { StatusLevel } from "./types";

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
  icon: "CircleCheck" | "Clock" | "Ban" | "OctagonX" | "CircleHelp";
  description: string;
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
