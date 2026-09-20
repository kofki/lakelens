import { CalendarClock, ChevronDown } from "lucide-react";
import type { Prediction } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { InfoSheet } from "@/components/ui/InfoSheet";
import { Section } from "@/components/ui/Section";

export interface PredictionCardProps {
  prediction: Prediction | null;
}

/**
 * How busy, not whether it will fill.
 *
 * "Might fill up today" claimed a specific outcome from a weekend and a forecast high,
 * which is not something this model can know: no park publishes live capacity. What the
 * calendar and the weather genuinely support is a statement about crowding, so that is
 * what it says.
 */
const HEADLINE: Record<Prediction["level"], string> = {
  none: "About as busy as usual",
  possible: "Busier than usual today",
  likely: "Much busier than usual today",
  closed: "Closed today",
};

const HOW_IT_WORKS = [
  {
    title: "What goes into it",
    body: "A weekend adds 2 points, a public holiday 3, a college break or a home game 1 to 2, and a forecast high at or above 90 °F another 1 to 3. A 50 % chance of rain takes 2 away.",
  },
  {
    title: "What the score means",
    body: "0 or less reads as a normal day, 1 to 2 as busier than usual, 3 or more as much busier. Each point above 2 also shifts the expected busy time 25 minutes earlier.",
  },
  {
    title: "It is an estimate",
    body: "This comes from the calendar, the forecast and past patterns. No park publishes live capacity, so this can never tell you a park will be full. Only an official closure, the swim season or visitors reporting they were turned away will mark a park closed or full.",
  },
];

/**
 * Closure estimate for any park that has one.
 *
 * Previously restricted to deep-coverage parks, which meant most of the map silently
 * lacked the feature the product is named for. The estimate is built from weather and the
 * calendar, both of which exist everywhere; a park with no curated fill time simply omits
 * that line instead of apologising for it.
 */
export function PredictionCard({ prediction }: PredictionCardProps) {
  if (!prediction) return null;

  return (
    <Section
      id="prediction"
      title="How busy today?"
      icon={<CalendarClock />}
      action={
        <InfoSheet label="How this is worked out" title="How this is worked out" entries={HOW_IT_WORKS} />
      }
    >
      <Card className="space-y-3">
        <p className="text-xl font-extrabold leading-tight text-ink">{HEADLINE[prediction.level]}</p>
        {prediction.predictedTimeLabel && (
          <p className="text-base text-cocoa">
            Usually busiest <strong>{prediction.predictedTimeLabel}</strong>.
          </p>
        )}

        {prediction.reasons.length > 0 && (
          <details className="group rounded-xl bg-cream p-3">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-bold text-cocoa [&::-webkit-details-marker]:hidden">
              <span>Why?</span>
              <ChevronDown aria-hidden="true" focusable="false" className="size-5 transition-transform group-open:rotate-180" />
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-cocoa">
              {prediction.reasons.map((r, i) => (
                <li key={`${i}-${r}`}>{r}</li>
              ))}
            </ul>
          </details>
        )}
      </Card>
    </Section>
  );
}
