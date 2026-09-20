import { Star } from "lucide-react";
import { formatScore } from "@/lib/reviewScore";
import { cn } from "./cn";

export interface RatingStarsProps {
  /** 0 to 5; fractional values partially fill the last star. */
  value: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE = { sm: "size-3.5", md: "size-4", lg: "size-5" } as const;

/**
 * Five stars filled to `value`.
 *
 * Decorative: the numeric score is always rendered next to it, so a screen reader hears
 * "4.6 out of 5" rather than counting glyphs. The partial star is a clipped overlay, which
 * keeps it exact at any width without a gradient per instance.
 */
export function RatingStars({ value, size = "md", className }: RatingStarsProps) {
  const clamped = Math.max(0, Math.min(5, value));
  return (
    <span aria-hidden="true" className={cn("relative inline-flex shrink-0", className)}>
      <span className="inline-flex">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} className={cn(SIZE[size], "text-mist")} fill="currentColor" strokeWidth={0} />
        ))}
      </span>
      <span className="absolute inset-0 overflow-hidden" style={{ width: `${(clamped / 5) * 100}%` }}>
        <span className="inline-flex">
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} className={cn(SIZE[size], "text-sunset")} fill="currentColor" strokeWidth={0} />
          ))}
        </span>
      </span>
    </span>
  );
}

export interface ScoreProps {
  average: number | null;
  count: number;
  /** Adds a "Sample data" note when any of the reviews are seeded. */
  sampleCount?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** The score as it appears at the top of a card or a park page. */
export function Score({ average, count, sampleCount = 0, size = "md", className }: ScoreProps) {
  if (average == null || count === 0) return null;
  const text = `${formatScore(average)} out of 5 from ${count} review${count === 1 ? "" : "s"}`;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <RatingStars value={average} size={size} />
      <span className={cn("font-extrabold text-ink", size === "lg" ? "text-base" : "text-sm")}>{formatScore(average)}</span>
      <span className={cn("text-mocha", size === "lg" ? "text-sm" : "text-xs")}>({count})</span>
      <span className="sr-only">
        {text}
        {sampleCount > 0 ? ", includes sample data" : ""}
      </span>
    </span>
  );
}
