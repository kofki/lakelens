import { CalendarCheck, DollarSign, Fish, Dog, ExternalLink, LifeBuoy, Scale, Ship, Wine } from "lucide-react";
import type { Park } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { ChipGrid, type ChipItem } from "@/components/ui/ChipGrid";
import { Section } from "@/components/ui/Section";
import { fishingAgency, mentionsFishing } from "@/lib/fishing";
import { OpeningHours } from "./OpeningHours";

export interface RulesCardProps {
  park: Park;
  now: Date;
}

/** A rule we have text for becomes a chip; one we do not becomes nothing. */
function ruleChip(label: string, icon: ChipItem["icon"], value: unknown): ChipItem {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return { label, icon, state: null };
  // "No pets", "Alcohol prohibited" and friends read as a restriction, so they get the
  // red treatment; anything else is a plain fact.
  const denied = /\b(no|not|prohibit|ban|forbid|never)\b/i.test(text);
  return { label: `${label}: ${text}`, icon, state: !denied, title: text };
}

export function RulesCard({ park, now }: RulesCardProps) {
  const rules = park.rules ?? {};
  const other = Array.isArray(rules.other) ? rules.other : [];
  const fishing = fishingAgency(park.state);

  const chips: ChipItem[] = [
    { label: park.fees ?? "", icon: <DollarSign aria-hidden="true" focusable="false" />, state: park.fees ? true : null },
    ruleChip("Alcohol", <Wine aria-hidden="true" focusable="false" />, rules.alcohol),
    ruleChip("Tubing", <Ship aria-hidden="true" focusable="false" />, rules.tubing),
    ruleChip("Pets", <Dog aria-hidden="true" focusable="false" />, rules.pets),
    ruleChip("Life jackets", <LifeBuoy aria-hidden="true" focusable="false" />, rules.life_jackets),
  ];

  const hasAnything = chips.some((c) => c.state !== null) || other.length > 0 || park.reservation_required || park.official_url || !!park.hours || mentionsFishing(park);
  if (!hasAnything) return null;

  return (
    <Section id="rules" title="Rules, hours and reservations" icon={<Scale aria-hidden="true" focusable="false" />}>
      {park.reservation_required && (
        <div className="mb-3 rounded-xl bg-peach p-3 text-sm text-cocoa">
          <p className="font-extrabold">
            <CalendarCheck aria-hidden="true" focusable="false" className="mr-1 inline h-4 w-4 align-text-bottom" />
            Day-use reservation required
          </p>
          <p className="mt-1">Book before you drive. Entry is not guaranteed without one.</p>
          {park.reservation_url && (
            <ButtonLink href={park.reservation_url} target="_blank" rel="noopener noreferrer" variant="primary" className="mt-2">
              Reserve day-use entry
              <ExternalLink aria-hidden="true" focusable="false" className="ml-1 h-4 w-4" />
              <span className="sr-only">(opens in a new tab)</span>
            </ButtonLink>
          )}
        </div>
      )}

      <OpeningHours park={park} now={now} className="mb-3" />

      <ChipGrid items={chips} />

      {other.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-cocoa">
          {other.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      {/* Fishing rules are state law and change every year, so this points at the agency
          that publishes them rather than restating limits that would go stale. */}
      {mentionsFishing(park) && fishing && (
        <div className="mt-3 rounded-xl border border-mist bg-cream p-3 text-sm text-cocoa">
          <p className="flex items-center gap-1.5 font-extrabold text-ink">
            <Fish aria-hidden="true" focusable="false" className="size-4 text-taupe" />
            Fishing
          </p>
          <p className="mt-1">
            A {park.state} fishing licence is required for anyone 16 or over. Seasons, size limits and bag limits are set
            by the {fishing.agency} and change each year.
          </p>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <a
              href={fishing.regulationsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1 font-bold text-brown underline underline-offset-2"
            >
              Current regulations
              <ExternalLink aria-hidden="true" focusable="false" className="size-3.5" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            <a
              href={fishing.licenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1 font-bold text-brown underline underline-offset-2"
            >
              Buy a licence
              <ExternalLink aria-hidden="true" focusable="false" className="size-3.5" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </p>
        </div>
      )}

      {park.entrance_notes && <p className="mt-3 text-sm text-mocha">{park.entrance_notes}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* The citation is Florida's own administrative code, so it only holds for Florida parks. */}
        {park.operator === "state" && park.state === "FL" && (
          <Badge variant="info">Florida State Park rules (F.A.C. 62D-2.014)</Badge>
        )}
        {park.official_url && (
          <a
            href={park.official_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-brown underline underline-offset-2"
          >
            Official park page
            <ExternalLink aria-hidden="true" focusable="false" className="h-4 w-4" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </div>
    </Section>
  );
}
