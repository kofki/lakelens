"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Drawer } from "vaul";
import { useMediaQuery } from "@/components/list/useMediaQuery";
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

/** A bottom sheet is a phone pattern; above this width it becomes a centred dialog. */
const DESKTOP_QUERY = "(min-width: 768px)";

/**
 * Centred modal dialog for laptops and up.
 *
 * A full-width sheet climbing up from the bottom of a 15-inch screen is a phone gesture
 * borrowed where it does not belong: the content ends up in a short, very wide strip with
 * the user's attention at the wrong end of the window. This uses the native dialog
 * element, which brings its own focus trap, Escape handling and top-layer backdrop.
 */
function CentredDialog({ open, onOpenChange, title, description, children, className }: ModalSheetProps) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // The element closes itself on Escape and on a backdrop click, so the parent's state has
  // to follow rather than lead.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onClose = () => onOpenChange(false);
    el.addEventListener("close", onClose);
    return () => el.removeEventListener("close", onClose);
  }, [onOpenChange]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-sheet-title"
      // Clicking the backdrop lands on the dialog itself; anything inside stops there.
      onClick={(e) => {
        if (e.target === ref.current) onOpenChange(false);
      }}
      className={cn(
        "m-auto w-[min(32rem,calc(100vw-3rem))] max-h-[85dvh] overflow-hidden rounded-card bg-cream p-0 text-cocoa shadow-[var(--shadow-sheet)]",
        "backdrop:bg-forest-deep/50",
        className,
      )}
    >
      <div className="max-h-[85dvh] overflow-y-auto p-5">
        <h2 id="modal-sheet-title" className="text-lg font-extrabold text-brown">
          {title}
        </h2>
        <p className={description ? "mt-1 text-sm text-mocha" : "sr-only"}>{description ?? title}</p>
        <div className="mt-4">{children}</div>
      </div>
    </dialog>
  );
}

/**
 * Modal sheet (Report, Filters, "Still full?", the info sheets).
 *
 * Phones get vaul's bottom drawer, which brings a focus trap, Escape and the drag-to-
 * dismiss gesture people expect. Laptops get a centred dialog instead. The persistent list
 * sheet is a separate hand-rolled component (BottomSheet) because vaul's non-modal plus
 * snap-points mode blocks map taps.
 */
export function ModalSheet(props: ModalSheetProps) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const { open, onOpenChange, title, description, children, className } = props;

  if (isDesktop) return <CentredDialog {...props} />;

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-forest-deep/50" />
        <Drawer.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-[var(--radius-card)] bg-cream shadow-[var(--shadow-sheet)] outline-none",
            className,
          )}
        >
          <div aria-hidden="true" className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-mist" />
          <div className="overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
            <Drawer.Title className="text-lg font-extrabold text-brown">{title}</Drawer.Title>
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
