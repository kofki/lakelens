"use client";

import { useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { ModalSheet } from "@/components/sheet/ModalSheet";
import { cn } from "./cn";

export interface InfoSheetEntry {
  title: string;
  body: string;
}

export interface InfoSheetProps {
  /** Accessible name for the trigger, e.g. "How the estimate works". */
  label: string;
  title: string;
  description?: string;
  entries?: InfoSheetEntry[];
  children?: ReactNode;
  className?: string;
}

/**
 * An info button that opens the long explanation in a sheet.
 *
 * The park page used to print every safety paragraph, every confidence definition and
 * every disclaimer inline, which buried the three numbers people came for. The copy is
 * still there, a tap away, so nothing is lost except the scrolling.
 */
export function InfoSheet({ label, title, description, entries, children, className }: InfoSheetProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-taupe transition-colors",
          "hover:bg-mist/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-taupe",
          className,
        )}
      >
        <Info aria-hidden="true" focusable="false" className="size-5" />
      </button>
      <ModalSheet open={open} onOpenChange={setOpen} title={title} description={description}>
        {entries && entries.length > 0 && (
          <ul className="flex flex-col gap-4">
            {entries.map((e) => (
              <li key={e.title}>
                <p className="text-sm font-extrabold text-ink">{e.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-cocoa">{e.body}</p>
              </li>
            ))}
          </ul>
        )}
        {children}
      </ModalSheet>
    </>
  );
}
