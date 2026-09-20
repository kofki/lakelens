import type { Metadata } from "next";
import type { ParkWithStatus } from "@/lib/types";
import { getParksWithStatus } from "@/lib/queries";
import { ListScreen } from "@/components/list/ListScreen";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Explore",
  description: "Every freshwater swim spot we cover: springs, lakes and rivers, sortable by distance and status.",
  alternates: { canonical: "/list" },
};

export default async function ListPage() {
  let parks: ParkWithStatus[] = [];
  try {
    parks = await getParksWithStatus();
  } catch {
    parks = [];
  }
  return <ListScreen parks={parks} />;
}
