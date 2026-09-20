"use client";

import { useEffect } from "react";
import { recordVisitSlug } from "@/lib/personal";

/**
 * Remember that this park was opened, for the "because you looked at" row on Explore.
 *
 * Renders nothing. It is an effect rather than a server-side write because it is about
 * this browser only: the last few slugs, capped, never sent anywhere.
 */
export function RecordVisit({ slug }: { slug: string }) {
  useEffect(() => {
    recordVisitSlug(slug);
  }, [slug]);
  return null;
}
