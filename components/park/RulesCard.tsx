import { CalendarCheck, Clock, DollarSign, Dog, ExternalLink, LifeBuoy, Scale, Ship, Wine } from "lucide-react";
import type { Park } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";

export interface RulesCardProps {
  park: Park;
}

const ROWS: { key: keyof Park["rules"]; label: string; icon: typeof Wine }[] = [
  { key: "alcohol", label: "Alcohol", icon: Wine },
  { key: "tubing", label: "Tubing", icon: Ship },
  { key: "pets", label: "Pets", icon: Dog },
  { key: "life_jackets", label: "Life jackets", icon: LifeBuoy },
];

export function RulesCard({ park }: RulesCardProps) {
  const rules = park.rules ?? {};
  const other = Array.isArray(rules.other) ? rules.other : [];

  return (
    <Section id="rules" title="Rules, hours and reservations" icon={<Scale aria-hidden="true" focusable="false" />}>
      {park.reservation_required && (
        <div className="mb-3 rounded-xl bg-peach p-3 text-sm text-cocoa">
          <p className="font-extrabold">
            <CalendarCheck aria-hidden="true" focusable="false" className="mr-1 inline h-4 w-4 align-text-bottom" />
            Day-use reservation required
          </p>
          <p className="mt-1">Book before you drive — entry is not guaranteed without one.</p>
          {park.reservation_url && (
            <ButtonLink href={park.reservation_url} target="_blank" rel="noopener noreferrer" variant="primary" className="mt-2">
              Reserve day-use entry
              <ExternalLink aria-hidden="true" focusable="false" className="ml-1 h-4 w-4" />
              <span className="sr-only">(opens in a new tab)</span>
            </ButtonLink>
          )}
        </div>
      )}

      <dl className="divide-y divide-mist">
        <div className="flex gap-3 py-2">
          <dt className="flex w-32 shrink-0 items-center gap-1 text-sm font-bold text-mocha">
            <Clock aria-hidden="true" focusable="false" className="h-4 w-4" /> Hours
          </dt>
          <dd className="text-sm text-cocoa">{park.hours ?? "Not stated"}</dd>
        </div>
        <div className="flex gap-3 py-2">
          <dt className="flex w-32 shrink-0 items-center gap-1 text-sm font-bold text-mocha">
            <DollarSign aria-hidden="true" focusable="false" className="h-4 w-4" /> Fees
          </dt>
          <dd className="text-sm text-cocoa">{park.fees ?? "Not stated"}</dd>
        </div>
        {ROWS.map(({ key, label, icon: Icon }) => {
          const value = rules[key];
          return (
            <div key={key} className="flex gap-3 py-2">
              <dt className="flex w-32 shrink-0 items-center gap-1 text-sm font-bold text-mocha">
                <Icon aria-hidden="true" focusable="false" className="h-4 w-4" /> {label}
              </dt>
              <dd className="text-sm text-cocoa">{typeof value === "string" && value ? value : "Not stated"}</dd>
            </div>
          );
        })}
      </dl>

      {other.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-cocoa">
          {other.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      {park.entrance_notes && <p className="mt-3 text-sm text-mocha">{park.entrance_notes}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {park.operator === "state" && <Badge variant="info">Florida State Park rules apply (F.A.C. 62D-2.014)</Badge>}
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
