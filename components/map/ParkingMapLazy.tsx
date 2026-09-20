"use client";

import dynamic from "next/dynamic";
import type { ParkingMapProps } from "./ParkingMap";

/** Client-only wrapper so maplibre-gl stays out of the server bundle. */
const ParkingMapLazy = dynamic<ParkingMapProps>(() => import("./ParkingMap"), {
  ssr: false,
  loading: () => (
    <div role="status" className="h-64 w-full animate-pulse rounded-card bg-aqua/50 md:h-72">
      <span className="sr-only">Loading the parking map</span>
    </div>
  ),
});

export default ParkingMapLazy;
export { ParkingMapLazy };
