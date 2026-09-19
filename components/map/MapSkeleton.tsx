import Link from "next/link";
import { cn } from "@/components/ui/cn";

/** Shown while the map bundle loads (and during the WebGL check). Server-safe. */
export function MapSkeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn("flex h-full w-full flex-col items-center justify-center gap-3 bg-aqua/40 text-cocoa", className)}
    >
      <div aria-hidden="true" className="size-10 animate-pulse rounded-full bg-aqua" />
      <p className="text-sm font-bold">Loading map…</p>
      <Link
        href="/list"
        className="inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-bold text-cocoa shadow-card"
      >
        Skip to the park list
      </Link>
    </div>
  );
}
