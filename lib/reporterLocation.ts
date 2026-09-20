"use client";

/**
 * Where the reporter is, if the browser will say and they have already allowed it.
 *
 * Deliberately never prompts. A permission dialog appearing at the moment someone taps
 * "send" is how a report gets abandoned, and the report is worth more than the badge on
 * it. If location is already granted we use it; otherwise the report goes out unplaced and
 * says so.
 */
export interface ReporterLocation {
  lat: number;
  lng: number;
}

const TIMEOUT_MS = 4_000;

export async function getReporterLocation(): Promise<ReporterLocation | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  try {
    const permission = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    if (permission && permission.state !== "granted") return null;
  } catch {
    // Safari has no Permissions API for geolocation. Fall through: the call below still
    // resolves from cache when permission was already given, and times out otherwise.
  }

  return new Promise((resolve) => {
    // Resolve rather than reject on every failure: sending is not blocked by this.
    const done = setTimeout(() => resolve(null), TIMEOUT_MS);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(done);
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        clearTimeout(done);
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: TIMEOUT_MS, maximumAge: 5 * 60_000 },
    );
  });
}
