/**
 * lib/backups.ts — "try these instead" suggestions when a park is full, filling or closed.
 * Candidates exclude the target and any park that is full/closed, honour the active
 * filters, and are sorted by straight-line distance (drive time is a 45 mph estimate).
 * Pure TS: no React / Next / DOM.
 */
import type { BackupSuggestion, Filters, ParkWithStatus, ParkingLot } from "./types";
import { driveMinutes, haversineKm, isAccessibleEntry } from "./distance";

export const BACKUP_TRIGGER_LEVELS = new Set(["full", "likely_full", "closed"]);
export const BACKUP_EXCLUDED_LEVELS = new Set(["full", "closed"]);

/** "Main lot · $6 per vehicle · 4 ADA spaces · overflow lot available" or null. */
export function summarizeParking(lots: ParkingLot[] | undefined): string | null {
  if (!lots || lots.length === 0) return null;
  const main = lots.find((l) => !l.is_overflow) ?? lots[0];
  const parts: string[] = [main.name];
  if (main.fee) parts.push(main.fee);
  if (typeof main.ada_spaces === "number") parts.push(`${main.ada_spaces} ADA ${main.ada_spaces === 1 ? "space" : "spaces"}`);
  if (lots.some((l) => l.is_overflow && l.id !== main.id)) parts.push("overflow lot available");
  return parts.join(" · ");
}

export function suggestBackups(
  target: ParkWithStatus,
  all: ParkWithStatus[],
  filters: Filters,
  lotsByPark: Record<string, ParkingLot[]> = {},
  max = 3,
): BackupSuggestion[] {
  if (!target || !BACKUP_TRIGGER_LEVELS.has(target.status.level)) return [];
  const origin = { lat: target.park.lat, lng: target.park.lng };

  const candidates = (all ?? []).filter((c) => {
    if (!c || c.park.id === target.park.id || c.park.slug === target.park.slug) return false;
    if (BACKUP_EXCLUDED_LEVELS.has(c.status.level)) return false;
    if (filters?.accessibleEntry && !isAccessibleEntry(c.accessibility)) return false;
    if (filters?.guardedOnly && c.park.guarded !== "yes") return false;
    if (filters?.deepOnly && c.park.coverage_tier !== "deep") return false;
    return Number.isFinite(c.park.lat) && Number.isFinite(c.park.lng);
  });

  const suggestions: BackupSuggestion[] = candidates.map((c) => {
    const distanceKm = haversineKm(origin, { lat: c.park.lat, lng: c.park.lng });
    return {
      park: c.park,
      status: c.status,
      accessibility: c.accessibility,
      distanceKm,
      driveMinutes: driveMinutes(distanceKm),
      parkingSummary: summarizeParking(lotsByPark[c.park.id] ?? lotsByPark[c.park.slug]),
    };
  });

  suggestions.sort((a, b) => a.distanceKm - b.distanceKm);
  return suggestions.slice(0, Math.max(0, max));
}
