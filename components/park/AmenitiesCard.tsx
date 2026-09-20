import { Baby, Beef, Croissant, Droplet, Sailboat, ShowerHead, Table, TentTree, Toilet, Waves } from "lucide-react";
import type { Park } from "@/lib/types";
import { amenityChips, type AmenityIcon } from "@/lib/amenities";
import { Card } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";

export interface AmenitiesCardProps {
  park: Park;
}

const ICONS: Record<AmenityIcon, typeof Toilet> = {
  toilet: Toilet,
  shower: ShowerHead,
  water: Droplet,
  grill: Beef,
  table: Table,
  shelter: TentTree,
  dock: Waves,
  ramp: Sailboat,
  boat: Sailboat,
  food: Croissant,
  play: Baby,
};

/**
 * What is actually at the park: restrooms, pavilions, docks, showers, grills, rentals.
 *
 * Only what OpenStreetMap has mapped, and only as presence. There is no "no restrooms"
 * chip, because an unmapped bathroom and a missing bathroom look identical from here and
 * telling a family there is no toilet when there is one is the worse mistake.
 */
export function AmenitiesCard({ park }: AmenitiesCardProps) {
  const chips = amenityChips(park.amenities);
  if (chips.length === 0) return null;

  return (
    <Section id="amenities" title="What's there" icon={<TentTree aria-hidden="true" focusable="false" />}>
      <Card>
        <ul className="flex flex-wrap gap-2">
          {chips.map((c) => {
            const Icon = ICONS[c.icon];
            return (
              <li key={c.kind}>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-mist bg-cream px-3 py-1.5 text-sm font-bold text-cocoa">
                  <Icon aria-hidden="true" focusable="false" className="size-4 text-taupe" />
                  {c.label}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-mocha">
          From OpenStreetMap. Things that are not mapped are not listed, so this is what we know is there rather than
          everything that is.
        </p>
      </Card>
    </Section>
  );
}
