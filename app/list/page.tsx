import type { Metadata } from "next";
import type { ParkWithStatus } from "@/lib/types";
import { getParksWithStatus, getStateCounts } from "@/lib/queries";
import { ListScreen } from "@/components/list/ListScreen";
import { isStateCode } from "@/lib/states";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Explore",
  description: "Every freshwater swim spot we cover: springs, lakes and rivers, sortable by distance and status.",
  alternates: { canonical: "/list" },
};

/**
 * The state lives in the URL, so the page can load one state's parks instead of the
 * country's.
 *
 * At 18,314 parks the whole list is about 2 MB gzipped, so the page carried a bounded
 * slice and the other sixteen thousand were unreachable. Scoping to a state puts every
 * park within reach of the picker, and the largest state is smaller than the slice was.
 */
export default async function ListPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const raw = (await searchParams).state?.toUpperCase();
  const state = raw && isStateCode(raw) ? raw : null;

  let parks: ParkWithStatus[] = [];
  let stateCounts: Record<string, number> = {};
  try {
    // A state is bounded: the largest has about 3,000 parks, which is well inside what a
    // page can carry. Only the nationwide view needs the tighter cap.
    [parks, stateCounts] = await Promise.all([
      getParksWithStatus(new Date(), { state, limit: state ? 4000 : undefined }),
      getStateCounts(),
    ]);
  } catch {
    parks = [];
  }
  return <ListScreen parks={parks} stateCounts={stateCounts} selectedState={state} />;
}
