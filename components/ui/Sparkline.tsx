import { cn } from "./cn";

const WIDTH = 100;
const HEIGHT = 40;
const PAD_Y = 4;

export interface SparklineProps {
  /** Nulls are gaps: the line is drawn across them, they just carry no vertex. */
  values: (number | null)[];
  /** Read out instead of the drawing, which is aria-hidden. */
  summary: string;
  /** Index to mark with a dot, e.g. the peak hour. */
  markIndex?: number | null;
  className?: string;
  /** Tailwind colour class for the stroke and fill, e.g. "text-level-warn". */
  toneClassName?: string;
}

/** Map values onto a 100x40 box. Returns the line path and the closed area path. */
export function sparklinePaths(values: (number | null)[]): { line: string; area: string; points: [number, number][] } | null {
  const usable = values.map((v, i) => [i, v] as const).filter((e): e is readonly [number, number] => typeof e[1] === "number" && Number.isFinite(e[1]));
  if (usable.length < 2) return null;
  const nums = usable.map(([, v]) => v);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const lastIndex = values.length - 1 || 1;
  const points = usable.map(([i, v]) => {
    const x = (i / lastIndex) * WIDTH;
    const y = HEIGHT - PAD_Y - ((v - min) / span) * (HEIGHT - PAD_Y * 2);
    return [Number(x.toFixed(2)), Number(y.toFixed(2))] as [number, number];
  });
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  const area = `${line} L${points[points.length - 1][0]} ${HEIGHT} L${points[0][0]} ${HEIGHT} Z`;
  return { line, area, points };
}

/**
 * A tiny day curve. Used for the UV index across today's hours.
 *
 * The drawing is decorative and hidden from assistive technology; `summary` carries the
 * same information in words, because a shape is not a reading.
 */
export function Sparkline({ values, summary, markIndex, className, toneClassName = "text-level-warn" }: SparklineProps) {
  const paths = sparklinePaths(values);
  if (!paths) return null;
  const mark = markIndex != null ? paths.points[Math.min(Math.max(0, markIndex), paths.points.length - 1)] : null;
  return (
    <figure className={cn("mt-1", className)}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
        className={cn("h-10 w-full", toneClassName)}
      >
        <path d={paths.area} fill="currentColor" opacity="0.14" />
        <path d={paths.line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {mark && <circle cx={mark[0]} cy={mark[1]} r="2.5" fill="currentColor" />}
      </svg>
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}
