"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import { cn } from "./cn";

export interface SegmentedTab {
  id: string;
  label: string;
}

export interface SegmentedTabsProps {
  tabs: SegmentedTab[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  className?: string;
}

/**
 * Pill-style tab list (beachlens.net "Weather & Conditions / Rules & Amenities / Reviews").
 * Roving tabindex with arrow / Home / End keys; selection follows focus.
 * The panel the consumer renders should use role="tabpanel".
 */
export function SegmentedTabs({ tabs, value, onChange, ariaLabel, className }: SegmentedTabsProps) {
  const base = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const current = tabs.findIndex((t) => t.id === value);
    let next = -1;
    if (e.key === "ArrowRight") next = (current + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next < 0 || !tabs[next]) return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn("flex w-full gap-1 rounded-full bg-mist-light p-1", className)}
    >
      {tabs.map((t, i) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${base}-tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={cn(
              "min-h-11 min-w-0 flex-1 rounded-full px-3 text-sm font-bold leading-tight transition-colors",
              selected ? "bg-brown text-white shadow-card" : "text-brown hover:bg-white",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
