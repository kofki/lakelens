import { CalendarClock, ChevronDown } from "lucide-react";
import type { Prediction } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { InfoSheet } from "@/components/ui/InfoSheet";
import { Section } from "@/components/ui/Section";

export interface PredictionCardProps {
  prediction: Prediction | null;
}

const HEADLINE: Record<Prediction["level"], string> = {
  none: "No closure expected today",
  possible: "Might fill up today",
  likely: "Likely to fill up today",
  closed: "Closed today",
};

const HOW_IT_WORKS = [
  {
    title: "What goes into it",
    body: "A weekend adds 2 points, a public holiday 3, a college break or a home game 1 to 2, and a forecast high at or above 90 °F another 1 to 3. A 50 % chance of rain takes 2 away.",
  },
  {
    title: "What the score means",
    body: "0 or less means no closure expected, 1 to 2 means possible, 3 or more means likely. Each point above 2 also shifts the expected fill time 25 minutes earlier.",
  },
  {
    title: "It is an estimate",
    body: "This comes from the calendar, the forecast and past patterns. It is not an official capacity count, and only an official closure, the swim season or visitors reporting they were turned away will mark a park full or closed.",
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
      title="Will it fill up?"
      icon={<CalendarClock />}
      action={
        <span className="flex items-center gap-1">
          <Badge variant="estimate" />
          <InfoSheet label="How the closure estimate works" title="How the estimate works" entries={HOW_IT_WORKS} />
        </span>
      }
    >
      <Card className="space-y-3">
        <p className="text-xl font-extrabold leading-tight text-ink">{HEADLINE[prediction.level]}</p>
        {prediction.predictedTimeLabel && (
          <p className="text-base text-cocoa">
            Expected to reach capacity <strong>{prediction.predictedTimeLabel}</strong>.
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
