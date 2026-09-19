import Link from "next/link";
import { CalendarClock, ChevronDown } from "lucide-react";
import type { Park, Prediction } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";

export interface PredictionCardProps {
  park: Park;
  prediction: Prediction | null;
}

const HEADLINE: Record<Prediction["level"], string> = {
  none: "No closure expected today",
  possible: "Might fill up today",
  likely: "Likely to fill up today",
  closed: "Closed today",
};

const CONFIDENCE_HELP = {
  high: "High confidence — live weather, a known typical fill time and detailed park data.",
  medium: "Medium confidence — one of live weather, typical fill time or detailed park data is missing.",
  low: "Low confidence — little data to go on. Treat this as a rough guess.",
} as const;

/**
 * Closure estimate (deep-coverage parks only). Always labelled as an estimate, with the
 * plain-language reasons behind the score in a "Why?" disclosure.
 */
export function PredictionCard({ park, prediction }: PredictionCardProps) {
  if (park.coverage_tier !== "deep" || !prediction) return null;

  return (
    <Section id="prediction" title="Will it fill up?" icon={<CalendarClock />} action={<Badge variant="estimate" />}>
      <Card className="space-y-3">
        <p className="text-xl font-extrabold leading-tight text-cocoa">{HEADLINE[prediction.level]}</p>
        {prediction.predictedTimeLabel ? (
          <p className="text-base text-cocoa">
            Expected to reach capacity <strong>{prediction.predictedTimeLabel}</strong>.
          </p>
        ) : prediction.level === "none" || prediction.level === "closed" ? null : (
          <p className="text-base text-cocoa">We don&apos;t know a typical fill time for this park yet.</p>
        )}
        <p className="text-sm text-cocoa/75">{CONFIDENCE_HELP[prediction.confidence]}</p>

        <details className="group rounded-xl bg-cream p-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-bold text-cocoa [&::-webkit-details-marker]:hidden">
            <span>Why?</span>
            <ChevronDown aria-hidden="true" focusable="false" className="size-5 transition-transform group-open:rotate-180" />
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-cocoa">
            {prediction.reasons.length === 0 && <li>No crowd signals for today.</li>}
            {prediction.reasons.map((r, i) => (
              <li key={`${i}-${r}`}>{r}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-cocoa/75">
            Crowd score {prediction.score} (0 or less = no closure expected, 1–2 = possible, 3+ = likely).{" "}
            <Link href="/about#prediction" className="font-bold underline">
              How this estimate works
            </Link>
          </p>
        </details>

        <p className="text-xs text-cocoa/75">
          This is an estimate from the calendar, the forecast and past patterns — not an official capacity count.
        </p>
      </Card>
    </Section>
  );
}
