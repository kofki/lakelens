import { cn } from "./cn";

export interface WindDialProps {
  /** Degrees the wind blows FROM (meteorological). */
  degrees: number | null;
  mph: number;
  className?: string;
}

const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

export function cardinal(degrees: number): string {
  return CARDINALS[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
}

/**
 * A small compass instead of a sentence.
 *
 * "Wind from the southeast at 12 mph" is a line of prose; a needle is instant and costs
 * no width. Screen readers still get the sentence.
 */
export function WindDial({ degrees, mph, className }: WindDialProps) {
  if (degrees == null || !Number.isFinite(degrees)) return null;
  return (
    <span
      className={cn("relative inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-mist bg-cream", className)}
      role="img"
      aria-label={`Wind from the ${cardinal(degrees)} at ${Math.round(mph)} miles per hour`}
    >
      <span aria-hidden="true" className="absolute top-0.5 text-[0.5rem] font-bold text-mocha">
        N
      </span>
      <span
        aria-hidden="true"
        className="absolute h-5 w-0.5 origin-bottom rounded-full bg-taupe"
        style={{ transform: `rotate(${degrees}deg) translateY(-25%)` }}
      />
    </span>
  );
}
