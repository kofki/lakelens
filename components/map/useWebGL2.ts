"use client";

import { useEffect, useState } from "react";

/**
 * Feature-detects a usable WebGL context for MapLibre.
 * Returns null on the first render (so server and client markup match), then true/false.
 * MapLibre 5 still runs on WebGL1, so WebGL1 counts as supported; 6.x will need WebGL2.
 */
export function useWebGL2(): boolean | null {
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    let ok = false;
    try {
      const canvas = document.createElement("canvas");
      ok = Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
    } catch {
      ok = false;
    }
    setSupported(ok);
  }, []);
  return supported;
}
