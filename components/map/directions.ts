/**
 * Deep links into the phone's maps app. Pure TS (safe for tests and server code);
 * `detectMapsPlatform` must only be called in the browser.
 */
export type MapsPlatform = "apple" | "google";

export function detectMapsPlatform(): MapsPlatform {
  if (typeof navigator === "undefined") return "google";
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod|Macintosh/i.test(ua) ? "apple" : "google";
}

export function directionsUrl(lat: number, lng: number, label: string, platform: MapsPlatform = "google"): string {
  const point = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  if (platform === "apple") {
    return `https://maps.apple.com/?daddr=${point}&dirflg=d&q=${encodeURIComponent(label)}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${point}&travelmode=driving`;
}
