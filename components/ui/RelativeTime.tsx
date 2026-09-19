"use client";

import { useSyncExternalStore } from "react";
import { relativeTime } from "@/lib/freshness";

/**
 * Ticking clock store: re-renders subscribers every 30 s so "25 min ago" stays honest
 * without any setState-in-effect. The server snapshot is a sentinel so hydration
 * keeps the server-rendered text (see suppressHydrationWarning below); the first
 * client tick then replaces it with the live value.
 */
const listeners = new Set<() => void>();
let timer: number | undefined;

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (timer === undefined) {
    timer = window.setInterval(() => listeners.forEach((l) => l()), 30_000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
}

function getSnapshot() {
  return Math.floor(Date.now() / 30_000);
}

function getServerSnapshot() {
  return -1;
}

export interface RelativeTimeProps {
  /** ISO timestamp */
  at: string;
  className?: string;
}

/**
 * "<time>25 min ago</time>" that never causes a hydration mismatch, even when the HTML
 * was rendered earlier by ISR: the server text is kept during hydration, then updated.
 */
export function RelativeTime({ at, className }: RelativeTimeProps) {
  const tick = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // tick < 0 only during SSR/hydration (server text is kept); afterwards the 30 s bucket is precise enough.
  const now = tick < 0 ? new Date() : new Date(tick * 30_000);
  const text = relativeTime(at, now);
  return (
    <time dateTime={at} className={className} suppressHydrationWarning>
      {text}
    </time>
  );
}
