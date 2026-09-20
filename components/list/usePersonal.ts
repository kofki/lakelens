"use client";

import { useSyncExternalStore } from "react";
import { getFavorites, getPersonalServer, getRecents, subscribePersonal } from "@/lib/personal";

/** Saved park slugs for this browser. Empty during server render. */
export function useFavorites(): string[] {
  return useSyncExternalStore(subscribePersonal, getFavorites, getPersonalServer);
}

/** Recently opened park slugs, newest first. Empty during server render. */
export function useRecents(): string[] {
  return useSyncExternalStore(subscribePersonal, getRecents, getPersonalServer);
}
