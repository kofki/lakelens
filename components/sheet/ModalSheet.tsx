"use client";

import type { ReactNode } from "react";
import { Drawer } from "vaul";
import { cn } from "@/components/ui/cn";

export interface ModalSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Read by screen readers; shown under the title when provided. */
  description?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Modal bottom sheet (Report, Filters, "Still full?").
 * vaul in its default modal mode gives us focus trap, Escape, and Title/Description
 * announcements for free. The persistent list sheet is a separate hand-rolled
 * component (BottomSheet) because vaul's non-modal + snap-points mode blocks map taps.
 */
export function ModalSheet({ open, onOpenChange, title, description, children, className }: ModalSheetProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-cocoa/40" />
        <Drawer.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-[var(--radius-card)] bg-cream shadow-[var(--shadow-sheet)] outline-none",
            className,
          )}
        >
          <div aria-hidden="true" className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-mist" />
          <div className="overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
            <Drawer.Title className="text-lg font-extrabold text-cocoa">{title}</Drawer.Title>
            <Drawer.Description className={description ? "mt-1 text-sm text-mocha" : "sr-only"}>
              {description ?? title}
            </Drawer.Description>
            <div className="mt-4">{children}</div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
