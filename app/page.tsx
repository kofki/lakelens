import type { Metadata } from "next";
import type { ParkWithStatus } from "@/lib/types";
import { getParksWithStatus } from "@/lib/queries";
import { MapScreen } from "@/components/map/MapScreen";

export const revalidate = 60;

export const metadata: Metadata = {
  // "Map" alone told search engines nothing; the template appends " | LakeLens".
  title: "Florida springs & swim-area map",
  description: "Florida springs and state-park swim areas: which are open, which are likely to fill, and where you can get into the water.",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  let parks: ParkWithStatus[] = [];
  try {
    parks = await getParksWithStatus();
  } catch {
    parks = [];
  }
  return <MapScreen parks={parks} />;
}
