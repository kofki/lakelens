import { Dog, LifeBuoy, Mountain, ShieldCheck, ShieldOff, ShieldQuestionMark, Snowflake, TriangleAlert, Waves, Wine } from "lucide-react";
import type { Park, UsgsPayload } from "@/lib/types";
import { describeFlow } from "@/lib/plainLanguage";
import { Card } from "@/components/ui/Card";
import { InfoSheet } from "@/components/ui/InfoSheet";
import { Section } from "@/components/ui/Section";
import { cn } from "@/components/ui/cn";

export interface SafetyCardProps {
  park: Park;
  usgs: UsgsPayload | null;
  usgsFetchedAt: string | null;
  now: Date;
}

interface Warning {
  icon: typeof TriangleAlert;
  label: string;
  danger?: boolean;
}

/**
 * The general freshwater rules, which apply everywhere.
 *
 * These used to print as six paragraphs on every park page, above the park-specific lines.
 * They are unchanged advice and still one tap away, but a wall of identical text on 84
 * pages buried the warnings that are actually about this park.
 */
const GENERAL_RULES = [
  {
    title: "Assume there is no lifeguard",
    body: "Most Florida springs and lakes are unguarded. Swim with a buddy and keep children within arm's reach.",
  },
  {
    title: "Spring water is about 72 °F all year",
    body: "That is cold enough to tire a swimmer quickly. Take breaks, and get out if you start shivering.",
  },
  {
    title: "Currents can be stronger than they look",
    body: "Rivers and spring runs move fast after rain. Never dive: depth changes and rocks are hard to see.",
  },
  {
    title: "Leave the water at the first thunder",
    body: "Florida afternoon storms build fast. Wait 30 minutes after the last thunder before going back in.",
  },
  {
    title: "Wildlife lives here",
    body: "Alligators and snakes are part of every Florida waterway. Keep pets and small children away from the bank at dusk.",
  },
  {
    title: "Alcohol and swimming do not mix",
    body: "Most public parks ban alcohol. Even where it is allowed, it is the leading factor in drownings.",
  },
];

/**
 * Safety as chips, with the explanations behind an info button.
 *
 * Every park gets the same treatment: the chips shown are the ones we can state for this
 * park, and a park we know less about simply shows fewer. There is no note explaining that
 * details are missing.
 */
export function SafetyCard({ park, usgs }: SafetyCardProps) {
  const warnings: Warning[] = [];

  if (park.guarded === "no") warnings.push({ icon: ShieldOff, label: "No lifeguard", danger: true });
  else if (park.guarded === "yes") warnings.push({ icon: ShieldCheck, label: "Lifeguard on duty" });
  else warnings.push({ icon: ShieldQuestionMark, label: "Assume no lifeguard" });

  if (park.cavern_warning) warnings.push({ icon: Mountain, label: "Cave diving kills", danger: true });

  // The only place the live high-flow warning survives now that flow left the stat grid.
  const flow = describeFlow(usgs, park);
  if (flow.level === "high") warnings.push({ icon: Waves, label: "Strong current today", danger: true });

  if (park.type === "spring") warnings.push({ icon: Snowflake, label: "Cold water, about 72 °F" });
  if (park.rules.alcohol) warnings.push({ icon: Wine, label: park.rules.alcohol });
  if (park.rules.life_jackets) warnings.push({ icon: LifeBuoy, label: park.rules.life_jackets });
  if (park.rules.pets) warnings.push({ icon: Dog, label: park.rules.pets });

  return (
    <Section
      id="safety"
      title="Safety"
      icon={<TriangleAlert />}
      action={<InfoSheet label="Freshwater safety rules" title="Freshwater safety" entries={GENERAL_RULES} />}
    >
      <Card className="space-y-3">
        <ul className="flex flex-wrap gap-2">
          {warnings.map((w) => (
            <li key={w.label}>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-bold [&>svg]:size-4",
                  w.danger
                    ? "border-status-full-edge/40 bg-status-full-bg text-status-full"
                    : "border-mist bg-cream text-cocoa",
                )}
              >
                <w.icon aria-hidden="true" focusable="false" strokeWidth={2.25} />
                {w.label}
              </span>
            </li>
          ))}
        </ul>
        {park.safety_notes && (
          <p className="border-t border-mist pt-3 text-sm text-cocoa">
            <span className="font-bold">From the rangers: </span>
            {park.safety_notes}
          </p>
        )}
      </Card>
    </Section>
  );
}
