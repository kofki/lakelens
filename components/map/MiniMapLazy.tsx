"use client";

import dynamic from "next/dynamic";
import type { MiniMapProps } from "./MiniMap";

/** Client-only wrapper for the detail-page mini map (keeps maplibre-gl out of the server bundle). */
const MiniMapLazy = dynamic<MiniMapProps>(() => import("./MiniMap"), {
  ssr: false,
  loading: () => (
    <div role="status" className="h-56 w-full animate-pulse rounded-card bg-aqua/50">
      <span className="sr-only">Loading map…</span>
    </div>
  ),
});

export default MiniMapLazy;
export { MiniMapLazy };
