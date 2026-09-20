import type { Metadata } from "next";
import type { ParkWithStatus } from "@/lib/types";
import { getParksWithStatus } from "@/lib/queries";
import { ListScreen } from "@/components/list/ListScreen";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "All parks",
  description: "Every Florida state park with swimming, plus the springs we cover in depth, sortable by distance and status.",
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
