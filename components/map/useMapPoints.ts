"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MapPoint, MapPointsResult } from "@/lib/mapPoints";

export interface MapPointsState {
  points: MapPoint[];
  /** How many parks are in view, which can exceed what was drawn. */
  total: number;
  truncated: boolean;
  loading: boolean;
}

/**
 * Pins for whatever the map is looking at.
 *
 * Fetched rather than handed down, because the page used to carry every park in the
 * country and that reached 1.95 MB gzipped. A pan is a request now, and a cheap one: the
 * route is cached for a minute at the edge, so two people looking at the same place do not
 * both compute it.
 *
 * Requests are debounced and superseded: a drag fires many `moveend`s and only the last
 * viewport matters, so an in-flight request for an abandoned one is aborted rather than
 * left to arrive late and repaint the map behind the reader.
 */
export function useMapPoints(debounceMs = 250): MapPointsState & { load: (bbox: [number, number, number, number]) => void } {
  const [state, setState] = useState<MapPointsState>({ points: [], total: 0, truncated: false, loading: true });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const lastKey = useRef<string>("");

  const load = useCallback(
    (bbox: [number, number, number, number]) => {
      // Rounded: a one-pixel nudge should not be a new request, and it keeps the edge cache
      // hitting for viewports that are the same place to any human.
      const key = bbox.map((n) => n.toFixed(3)).join(",");
      if (key === lastKey.current) return;
      lastKey.current = key;

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        inFlight.current?.abort();
        const controller = new AbortController();
        inFlight.current = controller;
        setState((s) => ({ ...s, loading: true }));
        fetch(`/api/map-points?bbox=${key}`, { signal: controller.signal })
          .then((r) => (r.ok ? (r.json() as Promise<MapPointsResult>) : Promise.reject(new Error(String(r.status)))))
          .then((data) => {
            setState({ points: data.points, total: data.total, truncated: data.truncated, loading: false });
          })
          .catch((err) => {
            // An abort is this hook superseding itself, not a failure worth showing.
            if ((err as Error).name === "AbortError") return;
            console.warn("[lakelens/map] points unavailable:", err);
            setState((s) => ({ ...s, loading: false }));
          });
      }, debounceMs);
    },
    [debounceMs],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      inFlight.current?.abort();
    },
    [],
  );

  return { ...state, load };
}
