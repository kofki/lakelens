"use client";

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { Filters } from "@/lib/types";

/**
 * Keeps the accessible-entry filter in sync with `?accessible=1` so links from the
 * detail page's backup suggestions (and shared URLs) open pre-filtered.
 * Reads on mount (no Suspense/CSR bailout needed) and writes with replaceState.
 */
export function useAccessibleParam(filters: Filters, setFilters: Dispatch<SetStateAction<Filters>>): void {
  const mounted = useRef(false);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("accessible") === "1") {
        setFilters((f) => (f.accessibleEntry ? f : { ...f, accessibleEntry: true }));
      }
    } catch {
      /* no URL access (tests, odd embeds) */
    }
  }, [setFilters]);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    try {
      const url = new URL(window.location.href);
      if (filters.accessibleEntry) url.searchParams.set("accessible", "1");
      else url.searchParams.delete("accessible");
      const next = `${url.pathname}${url.search}${url.hash}`;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (next !== current) window.history.replaceState(window.history.state, "", next);
    } catch {
      /* ignore */
    }
  }, [filters.accessibleEntry]);
}
