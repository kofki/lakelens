"use client";

import { useEffect, useMemo, useState } from "react";
import type { ParkWithStatus } from "@/lib/types";

/**
 * Parks matching the search box, from the whole database.
 *
 * The page carries a bounded set of parks, so filtering it alone could not find a park
 * outside that set. This asks the server as the reader types (debounced, and superseded
 * when they keep typing), and the caller merges the answer into what it already has.
 */
export function useParkSearch(query: string, debounceMs = 250): ParkWithStatus[] {
  const [results, setResults] = useState<ParkWithStatus[]>([]);
  const q = query.trim();

  useEffect(() => {
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((r) => (r.ok ? (r.json() as Promise<{ parks: ParkWithStatus[] }>) : Promise.reject(new Error(String(r.status)))))
        .then((data) => setResults(data.parks))
        .catch((err) => {
          if ((err as Error).name !== "AbortError") console.warn("[lakelens/search]", err);
        });
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, debounceMs]);

  return q.length < 2 ? [] : results;
}

/** The page's parks plus any search results it did not already have. */
export function useMergedParks(parks: ParkWithStatus[], extra: ParkWithStatus[]): ParkWithStatus[] {
  return useMemo(() => {
    if (extra.length === 0) return parks;
    const have = new Set(parks.map((item) => item.park.slug));
    const added = extra.filter((item) => !have.has(item.park.slug));
    return added.length ? [...parks, ...added] : parks;
  }, [parks, extra]);
}
