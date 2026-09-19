"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LatLng } from "@/lib/distance";

export type GeoStatus = "idle" | "loading" | "ready" | "denied" | "unavailable";

export interface GeolocationState {
  status: GeoStatus;
  location: LatLng | null;
  /** Plain-language status for a live region / helper text, or null when idle. */
  message: string | null;
  /** Ask the browser (prompts if needed). Never called automatically unless already granted. */
  request: () => void;
}

const MESSAGES: Record<GeoStatus, string | null> = {
  idle: null,
  loading: "Finding your location…",
  ready: "Showing distances from your location.",
  denied: "Location is off for this site. You can still sort by name or status.",
  unavailable: "Couldn't get your location right now.",
};

/**
 * Permission-gated geolocation. Location is optional everywhere in LakeLens:
 * it only unlocks distance sorting and "N mi away" chips.
 */
export function useGeolocation(): GeolocationState {
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [location, setLocation] = useState<LatLng | null>(null);
  const requested = useRef(false);

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      return;
    }
    requested.current = true;
    setStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus("ready");
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }, []);

  // If the person already granted location to this site, use it silently (no prompt).
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
    let cancelled = false;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((p) => {
        if (!cancelled && p.state === "granted" && !requested.current) request();
      })
      .catch(() => {
        /* permissions API unsupported: wait for the button */
      });
    return () => {
      cancelled = true;
    };
  }, [request]);

  return { status, location, message: MESSAGES[status], request };
}
