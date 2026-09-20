"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { STALE, isStale } from "@/lib/freshness";

const requested = new Set<string>();

/**
 * When a park page opens with stale USGS/weather snapshots, ask the server to refresh
 * them once per park per session, then re-render with fresh data.
 */
export function useStaleRefresh(parkId: string, usgsFetchedAt: string | null, weatherFetchedAt: string | null, hasGauge: boolean): void {
  const router = useRouter();
  useEffect(() => {
    if (requested.has(parkId)) return;
    const now = new Date();
    const usgsStale = hasGauge && isStale(usgsFetchedAt, STALE.usgs, now);
    const weatherStale = isStale(weatherFetchedAt, STALE.weather, now);
    if (!usgsStale && !weatherStale) return;
    requested.add(parkId);
    const sources = [usgsStale ? "usgs" : null, weatherStale ? "weather" : null].filter(Boolean);
    fetch("/api/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ park_id: parkId, sources }),
    })
      .then((r) => {
        if (r.ok) router.refresh();
      })
      .catch(() => {
        /* offline: the page already shows "may be out of date" */
      });
  }, [parkId, usgsFetchedAt, weatherFetchedAt, hasGauge, router]);
}
