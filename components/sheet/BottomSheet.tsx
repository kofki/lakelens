"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@/components/ui/cn";

export interface BottomSheetProps {
  /** Which snap point is active: 0 = peek, 1 = half, 2 = full. */
  index: number;
  onIndexChange: (index: number) => void;
  /** Current visible height in px (changes while dragging) — the map uses it as bottom padding. */
  onHeightChange?: (px: number) => void;
  ariaLabel: string;
  /** Drag handle area content: counts, filter chips, search. */
  header?: ReactNode;
  children: ReactNode;
  className?: string;
}

export const SHEET_PEEK_PX = 96;

function computeSnaps(viewportHeight: number): number[] {
  return [SHEET_PEEK_PX, Math.round(viewportHeight * 0.45), Math.round(viewportHeight * 0.88)];
}

function subscribeResize(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}

function useViewportHeight(): number {
  return useSyncExternalStore(
    subscribeResize,
    () => window.innerHeight,
    () => 800,
  );
}

function nearestIndex(snaps: number[], h: number): number {
  let best = 0;
  for (let i = 1; i < snaps.length; i++) {
    if (Math.abs(snaps[i] - h) < Math.abs(snaps[best] - h)) best = i;
  }
  return best;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

/**
 * Persistent, non-modal bottom sheet that sits over the map.
 * Hand-rolled (~120 lines) on purpose: vaul's non-modal + snapPoints mode leaves
 * body pointer-events:none (vaul#534), which would make the map untappable.
 *
 * Accessibility: the sheet is a labelled region; the handle is a real button with
 * aria-expanded so keyboard/screen-reader users can toggle peek <-> full without
 * dragging. Content only scrolls at the top snap so touch drags move the sheet first.
 */
export function BottomSheet({ index, onIndexChange, onHeightChange, ariaLabel, header, children, className }: BottomSheetProps) {
  const viewportHeight = useViewportHeight();
  const snaps = useMemo(() => computeSnaps(viewportHeight), [viewportHeight]);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startHeight: number; lastY: number; lastT: number; velocity: number } | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  const maxHeight = snaps[snaps.length - 1];
  const clampedIndex = Math.min(Math.max(index, 0), snaps.length - 1);
  const targetHeight = snaps[clampedIndex];
  const height = dragHeight ?? targetHeight;
  const expanded = clampedIndex === snaps.length - 1;

  useEffect(() => {
    onHeightChange?.(height);
  }, [height, onHeightChange]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      drag.current = { startY: e.clientY, startHeight: height, lastY: e.clientY, lastT: performance.now(), velocity: 0 };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [height],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d) return;
      const now = performance.now();
      d.velocity = (e.clientY - d.lastY) / Math.max(1, now - d.lastT);
      d.lastY = e.clientY;
      d.lastT = now;
      const next = Math.min(maxHeight, Math.max(SHEET_PEEK_PX, d.startHeight - (e.clientY - d.startY)));
      setDragHeight(next);
    },
    [maxHeight],
  );

  const onPointerUp = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const h = dragHeight ?? targetHeight;
    let next = nearestIndex(snaps, h);
    // Flick bias: a fast upward drag opens the next snap, a fast downward drag closes one.
    if (d.velocity < -0.35) next = Math.min(snaps.length - 1, snaps.findIndex((s) => s > h + 1) === -1 ? snaps.length - 1 : snaps.findIndex((s) => s > h + 1));
    else if (d.velocity > 0.35) {
      const below = [...snaps].reverse().findIndex((s) => s < h - 1);
      next = below === -1 ? 0 : snaps.length - 1 - below;
    }
    setDragHeight(null);
    onIndexChange(next);
  }, [dragHeight, targetHeight, snaps, onIndexChange]);

  return (
    <section
      role="region"
      aria-label={ariaLabel}
      className={cn(
        "fixed inset-x-0 z-30 flex flex-col rounded-t-[var(--radius-card)] bg-white shadow-[var(--shadow-sheet)]",
        className,
      )}
      style={{
        bottom: "calc(var(--bottom-nav-h) + env(safe-area-inset-bottom))",
        height: maxHeight,
        transform: `translateY(${maxHeight - height}px)`,
        transition: dragHeight !== null || reducedMotion ? "none" : "transform 260ms cubic-bezier(.2,.8,.2,1)",
        willChange: "transform",
      }}
    >
      <div
        className="shrink-0 touch-none select-none px-4 pt-1"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse park list" : "Expand park list"}
          onClick={() => onIndexChange(expanded ? 0 : snaps.length - 1)}
          className="mx-auto flex min-h-11 w-full items-center justify-center rounded-lg"
        >
          <span aria-hidden="true" className="block h-1.5 w-12 rounded-full bg-mist" />
        </button>
        {header}
      </div>
      <div className={cn("flex-1 px-4 pb-4", expanded ? "overflow-y-auto overscroll-contain" : "overflow-hidden")}>{children}</div>
    </section>
  );
}
