"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js in production only (a cached Turbopack chunk breaks HMR in dev).
 * In development any previously registered worker is removed so stale caches never
 * shadow fresh code. updateViaCache "none" + no-cache headers keep the worker current.
 */
export function RegisterSW() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {});
      return;
    }
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}
