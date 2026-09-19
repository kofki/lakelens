/**
 * Small formatting helpers shared by the park detail sections.
 * Server-safe (no React state, no DOM).
 */
import type { EntryType, Guarded, StatusSource, Surface, WaterAccess } from "@/lib/types";
import { kmToMiles } from "@/lib/distance";

/** "12 mi" / "0.4 mi" */
export function milesLabel(km: number): string {
  const mi = kmToMiles(km);
  if (!Number.isFinite(mi)) return "";
  return mi < 10 ? `${(Math.round(mi * 10) / 10).toString()} mi` : `${Math.round(mi)} mi`;
}

/** "about 50 m (160 ft)" */
export function metresLabel(m: number): string {
  const ft = Math.round(m * 3.28084);
  return `about ${Math.round(m)} m (${ft} ft)`;
}

/** Booleans that may be unknown are always shown as text, never as a bare icon. */
export function yesNoUnknown(v: boolean | null | undefined): "Yes" | "No" | "Unknown" {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "Unknown";
}

export function textOrNotStated(v: string | null | undefined): string {
  const t = (v ?? "").trim();
  return t.length ? t : "Not stated";
}

export const WATER_ACCESS_TEXT: Record<WaterAccess, string> = {
  yes: "Yes — wheelchair users can reach the water",
  limited: "Limited — reachable with help or at some spots",
  no: "No — no accessible route to the water",
  unknown: "Unknown",
};

export const ENTRY_TYPE_TEXT: Record<EntryType, string> = {
  ramp: "Ramp",
  stairs: "Stairs",
  dock_ladder: "Dock with ladder",
  sloped_bank: "Sloped bank",
  sand: "Sand",
  other: "Other",
  unknown: "Unknown",
};

export const SURFACE_TEXT: Record<Surface, string> = {
  paved: "Paved",
  boardwalk: "Boardwalk",
  sand: "Sand",
  natural: "Natural (dirt, grass or roots)",
  unknown: "Unknown",
};

export const GUARDED_TEXT: Record<Guarded, string> = {
  yes: "Lifeguard on duty",
  no: "No lifeguard on duty",
  unknown: "Lifeguard status unknown",
};

export const PARK_TYPE_TEXT = {
  spring: "Spring",
  lake: "Lake",
  river: "River",
  beach: "Beach",
} as const;

export const OPERATOR_TEXT = {
  state: "State park",
  county: "County park",
  private: "Privately run",
} as const;

/** Plain-language label for where a status came from. */
export const STATUS_SOURCE_TEXT: Record<StatusSource, string> = {
  alert: "Official notice",
  seasonal: "Seasonal swim closure",
  confirmed_reports: "Confirmed by visitor reports",
  report_prediction: "Visitor report + our estimate",
  prediction: "Our estimate",
  unknown: "Not enough data",
};

/** Newest of a set of ISO timestamps (ignores null / invalid). */
export function newestIso(...values: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  let bestT = -Infinity;
  for (const v of values) {
    if (!v) continue;
    const t = Date.parse(v);
    if (Number.isFinite(t) && t > bestT) {
      bestT = t;
      best = v;
    }
  }
  return best;
}

/** next/image can only optimise hosts listed in next.config.ts; everything else is served as-is. */
export function canOptimizeImage(src: string): boolean {
  if (src.startsWith("/")) return true;
  try {
    const u = new URL(src);
    return u.protocol === "https:" && (u.hostname.endsWith(".supabase.co") || u.hostname === "upload.wikimedia.org");
  } catch {
    return false;
  }
}

/** Google Maps directions deep link (works on iOS and Android without an API key). */
export function directionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/** Plain-language confidence line shown next to the status pill. */
export const CONFIDENCE_TEXT = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
} as const;
