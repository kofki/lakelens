import {
  CloudLightning,
  Dog,
  LifeBuoy,
  Mountain,
  ShieldCheck,
  ShieldOff,
  ShieldQuestionMark,
  Snowflake,
  TriangleAlert,
  WavesHorizontal,
  Wine,
  type LucideIcon,
} from "lucide-react";
import type { Park, UsgsPayload } from "@/lib/types";
import { describeFlow } from "@/lib/plainLanguage";
import { STALE, isStale } from "@/lib/freshness";
import { Card } from "@/components/ui/Card";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { Section } from "@/components/ui/Section";

export interface SafetyCardProps {
  park: Park;
  usgs: UsgsPayload | null;
  usgsFetchedAt: string | null;
  now: Date;
}

interface SafetyRow {
  icon: LucideIcon;
  /** Rendered bold when true (the things that get people hurt). */
  strong?: boolean;
  danger?: boolean;
  title: string;
  body?: string;
  footer?: React.ReactNode;
}

function Row({ icon: Icon, strong, danger, title, body, footer }: SafetyRow) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className={`mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full ${danger ? "bg-status-full/10 text-status-full" : "bg-aqua text-cocoa"}`}
      >
        <Icon className="size-5" strokeWidth={2.25} focusable="false" />
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className={`text-sm leading-snug ${strong ? "font-extrabold text-cocoa" : "font-bold text-cocoa"}`}>{title}</p>
        {body && <p className="text-sm text-cocoa/85">{body}</p>}
        {footer}
      </div>
    </li>
  );
}

const GENERIC_ROWS: SafetyRow[] = [
  {
    icon: ShieldOff,
    strong: true,
    danger: true,
    title: "Assume there is no lifeguard on duty",
    body: "Most Florida springs and lakes are unguarded. Swim with a buddy and keep children within arm's reach.",
  },
  {
    icon: Snowflake,
    title: "Spring water is ~72°F year-round — cold enough to tire swimmers quickly",
    body: "Take breaks, and get out if you start shivering.",
  },
  {
    icon: WavesHorizontal,
    title: "Currents can be stronger than they look",
    body: "Rivers and spring runs move fast after rain. Never dive: depth changes and rocks are hard to see.",
  },
  {
    icon: CloudLightning,
    title: "Leave the water at the first thunder",
    body: "Florida afternoon storms build fast. Wait 30 minutes after the last thunder.",
  },
  {
    icon: Mountain,
    title: "Wildlife lives here",
    body: "Alligators and snakes are part of every Florida waterway. Keep pets and small children away from the bank at dusk.",
  },
  {
    icon: Wine,
    title: "Alcohol and swimming don't mix",
    body: "Most public parks ban alcohol; even where allowed, it is the top factor in drownings.",
  },
];

/**
 * Safety card. Deep-coverage parks get park-specific lines (lifeguard status, caverns,
 * live current strength, cold water, alcohol and life-jacket rules, ranger notes);
 * basic-coverage parks get a generic freshwater safety card.
 */
export function SafetyCard({ park, usgs, usgsFetchedAt, now }: SafetyCardProps) {
  const rows: SafetyRow[] = [];

  if (park.coverage_tier === "deep") {
    if (park.guarded === "no") {
      rows.push({
        icon: ShieldOff,
        strong: true,
        danger: true,
        title: "No lifeguard on duty",
        body: "Swim with a buddy and keep children within arm's reach.",
      });
    } else if (park.guarded === "yes") {
      rows.push({
        icon: ShieldCheck,
        title: "Lifeguard on duty",
        body: "Check the posted hours — guards are not on duty all day, every day.",
      });
    } else {
      rows.push({
        icon: ShieldQuestionMark,
        strong: true,
        title: "Lifeguard status unknown",
        body: "We could not confirm lifeguard coverage. Assume there is none.",
      });
    }

    if (park.cavern_warning) {
      rows.push({
        icon: Mountain,
        strong: true,
        danger: true,
        title: "Do not enter caves or caverns unless cave-certified",
        body: "Open-water certification is not enough. Cave diving here has killed experienced divers.",
      });
    }

    const flow = describeFlow(usgs, park);
    const usgsStale = isStale(usgsFetchedAt, STALE.usgs, now);
    rows.push({
      icon: WavesHorizontal,
      strong: flow.level === "high",
      danger: flow.level === "high",
      title: flow.sentence,
      body:
        flow.level === "high"
          ? "Stronger current than usual — weak swimmers and small children should stay near the entry."
          : flow.level === "unknown"
            ? "No live gauge for this spot. Check the current yourself before letting children in."
            : undefined,
      footer: usgs ? <LastUpdated at={usgsFetchedAt} source="USGS" stale={usgsStale} /> : undefined,
    });

    rows.push({
      icon: Snowflake,
      title: "Spring water is ~72°F year-round — cold enough to tire swimmers quickly",
      body: "Take breaks and get out if you start shivering.",
    });

    if (park.rules.alcohol) {
      rows.push({ icon: Wine, title: "Alcohol", body: park.rules.alcohol });
    }
    rows.push({
      icon: LifeBuoy,
      title: "Life jackets",
      body: park.rules.life_jackets ?? "Recommended for children and weak swimmers; bring your own, loaners are not guaranteed.",
    });
    if (park.rules.pets) {
      rows.push({ icon: Dog, title: "Pets", body: park.rules.pets });
    }
    if (park.safety_notes) {
      rows.push({ icon: TriangleAlert, title: "From the rangers", body: park.safety_notes });
    }
  } else {
    rows.push(...GENERIC_ROWS);
  }

  return (
    <Section id="safety" title="Safety" icon={<TriangleAlert />}>
      <Card>
        {park.coverage_tier !== "deep" && (
          <p className="mb-3 text-xs text-cocoa/75">
            Park-specific safety details are not yet available for this park. These are general freshwater rules.
          </p>
        )}
        <ul className="space-y-4">
          {rows.map((r, i) => (
            <Row key={`${i}-${r.title}`} {...r} />
          ))}
        </ul>
      </Card>
    </Section>
  );
}
