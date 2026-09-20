"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribes to a CSS media query. Server snapshot is `false`, so use it for logic
 * (e.g. map insets) only: visibility should be Tailwind breakpoints to avoid a
 * layout flash between SSR and hydration.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => window.matchMedia?.(query).matches ?? false, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
