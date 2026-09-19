"use client";

import dynamic from "next/dynamic";
import { MapSkeleton } from "./MapSkeleton";
import type { ParkMapProps } from "./ParkMap";

/**
 * Client-only entry point for the WebGL map. `ssr: false` must live in a client
 * component (Next 16), and this keeps maplibre-gl out of every non-map route.
 */
const ParkMapLazy = dynamic<ParkMapProps>(() => import("./ParkMap"), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

export default ParkMapLazy;
export { ParkMapLazy };
