import type { ReactNode } from "react";
import { cn } from "./cn";

/** `ok` and `high` are additive (level ramp); `neutral` renders the teal "ok" meter. */
export type StatTone = "neutral" | "good" | "ok" | "warn" | "high" | "bad";

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

/* Meter colours come from the level ramp tokens in app/globals.css. */
const BAR: Record<StatTone, string> = {
  neutral: "bg-level-ok",
  good: "bg-level-good",
  ok: "bg-level-ok",
  warn: "bg-level-warn",
  high: "bg-level-high",
  bad: "bg-level-bad",
};

/**
 * beachlens.net-style stat tile: icon + label, big value, descriptor, thin meter.
 * Ivory tile on white cards. The bar is decorative: value + descriptor already carry
 * the meaning in text.
 */
export function StatTile({ icon, label, value, descriptor, percent, tone = "neutral", footnote, className }: StatTileProps) {
  const pct = percent == null || Number.isNaN(percent) ? null : Math.max(0, Math.min(100, percent));
  return (
    <div className={cn("flex flex-col gap-1 rounded-tile border border-mist bg-cream p-4", className)}>
      <div className="flex items-center gap-2 text-sm font-bold text-mocha">
        <span aria-hidden="true" className="inline-flex shrink-0 text-taupe [&>svg]:size-4">
          {icon}
        </span>
        <span>{label}</span>
      </div>
      <div className="text-3xl font-bold leading-tight text-ink">{value}</div>
      {descriptor && <div className="text-sm text-cocoa">{descriptor}</div>}
      {pct != null && (
        <div aria-hidden="true" className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-mist">
          <div className={cn("h-full rounded-full transition-[width]", BAR[tone])} style={{ width: `${pct}%` }} />
        </div>
      )}
      {footnote && <div className="mt-1 text-xs text-mocha">{footnote}</div>}
    </div>
  );
}
