import type { ReactNode } from "react";
import { cn } from "./cn";

export type StatTone = "neutral" | "good" | "warn" | "bad";

export interface StatTileProps {
  icon: ReactNode;
  label: string;
  value: string;
  descriptor?: string;
  /** 0-100 fills the thin bar under the value; null/undefined hides it. */
  percent?: number | null;
  tone?: StatTone;
  footnote?: string;
  className?: string;
}

const BAR: Record<StatTone, string> = {
  neutral: "bg-sunset",
  good: "bg-status-open",
  warn: "bg-status-likely",
  bad: "bg-status-full",
};

/**
 * beachlens.net-style stat tile: icon + label, big value, descriptor, thin progress bar.
 * The bar is decorative: value + descriptor already carry the meaning in text.
 */
export function StatTile({ icon, label, value, descriptor, percent, tone = "neutral", footnote, className }: StatTileProps) {
  const pct = percent == null || Number.isNaN(percent) ? null : Math.max(0, Math.min(100, percent));
  return (
    <div className={cn("flex flex-col gap-1 rounded-card border border-mist/60 bg-white p-4 shadow-card", className)}>
      <div className="flex items-center gap-2 text-sm font-bold text-cocoa/75">
        <span aria-hidden="true" className="inline-flex shrink-0 text-sunset [&>svg]:size-4">
          {icon}
        </span>
        <span>{label}</span>
      </div>
      <div className="text-3xl font-extrabold leading-tight text-cocoa">{value}</div>
      {descriptor && <div className="text-sm text-cocoa">{descriptor}</div>}
      {pct != null && (
        <div aria-hidden="true" className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-mist">
          <div className={cn("h-full rounded-full transition-[width]", BAR[tone])} style={{ width: `${pct}%` }} />
        </div>
      )}
      {footnote && <div className="mt-1 text-xs text-cocoa/75">{footnote}</div>}
    </div>
  );
}
