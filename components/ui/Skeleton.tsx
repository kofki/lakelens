import { cn } from "./cn";

/** Loading placeholder block. Decorative; pair with visible "Loading…" text or a LiveRegion. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-xl bg-mist-light", className)} />;
}
