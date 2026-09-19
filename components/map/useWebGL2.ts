"use client";

import { useSyncExternalStore } from "react";

let detected: boolean | null = null;

function detect(): boolean {
  if (detected !== null) return detected;
  try {
    const canvas = document.createElement("canvas");
    detected = Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    detected = false;
  }
  return detected;
}

function subscribe() {
  return () => {};
}

/**
 * Feature-detects a usable WebGL context for MapLibre.
 * Returns null during server rendering / hydration (so markup matches), then true/false.
 * MapLibre 5 still runs on WebGL1, so WebGL1 counts as supported; 6.x will need WebGL2.
 */
export function useWebGL2(): boolean | null {
  return useSyncExternalStore(subscribe, detect, () => null);
}
