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
  /** Hex for inline styles (map markers). Passes 3:1 on white. */
  hex: string;
  icon: "CircleCheck" | "Clock" | "Ban" | "OctagonX" | "CircleHelp";
  description: string;
}

export const STATUS_META: Record<StatusLevel, StatusMeta> = {
  open: {
    label: "Open",
    shortLabel: "Open",
    colorToken: "status-open",
    hex: "#2e7d32",
    icon: "CircleCheck",
    description: "No closure expected right now.",
  },
  likely_full: {
    label: "Likely full soon",
    shortLabel: "Filling",
    colorToken: "status-likely",
    hex: "#c25e00",
    icon: "Clock",
    description: "Our estimate says this park may reach capacity today.",
  },
  full: {
    label: "Full / turned away",
    shortLabel: "Full",
    colorToken: "status-full",
    hex: "#c62828",
    icon: "Ban",
    description: "Visitors report being turned away at the gate.",
  },
  closed: {
    label: "Closed",
    shortLabel: "Closed",
    colorToken: "status-closed",
    hex: "#3d2518",
    icon: "OctagonX",
    description: "An official notice says swimming is closed.",
  },
  unknown: {
    label: "Status unknown",
    shortLabel: "?",
    colorToken: "status-unknown",
    hex: "#6d5546",
    icon: "CircleHelp",
    description: "Not enough data yet.",
  },
};

export const STATUS_ORDER: StatusLevel[] = ["open", "likely_full", "full", "closed", "unknown"];
