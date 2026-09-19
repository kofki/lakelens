import {
  Accessibility as AccessibilityIcon,
  Car,
  Dog,
  Footprints,
  Hand,
  Layers,
  Ruler,
  Sun,
  Toilet,
  WavesLadder,
  type LucideIcon,
} from "lucide-react";
import type { Accessibility, Park } from "@/lib/types";
import { isAccessibleEntry } from "@/lib/distance";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { Section } from "@/components/ui/Section";
import { ENTRY_TYPE_TEXT, SURFACE_TEXT, WATER_ACCESS_TEXT, metresLabel, textOrNotStated, yesNoUnknown } from "./format";

export interface AccessibilityCardProps {
  park: Park;
  accessibility: Accessibility | null;
}

interface RowDef {
  icon: LucideIcon;
  label: string;
  value: string;
}

/**
 * Every accessibility field as a label/value row. Unknowns are shown as the word
 * "Unknown" / "Not stated" — we never hide a field or guess.
 */
export function AccessibilityCard({ park, accessibility }: AccessibilityCardProps) {
  if (!accessibility) {
    return (
      <Section id="accessibility" title="Accessibility" icon={<AccessibilityIcon />}>
        <EmptyState
          icon={<AccessibilityIcon />}
          title="Accessibility details not yet available"
          body={`We have not verified water access, parking or restrooms at ${park.name} yet. If you have been, a quick accessibility report helps the next visitor.`}
        />
      </Section>
    );
  }

  const a = accessibility;
  const rows: RowDef[] = [
    { icon: WavesLadder, label: "Water access for wheelchair users", value: WATER_ACCESS_TEXT[a.water_access] },
    { icon: Footprints, label: "How you get in", value: ENTRY_TYPE_TEXT[a.entry_type] },
    { icon: Car, label: "ADA parking", value: yesNoUnknown(a.ada_parking) },
    {
      icon: Ruler,
      label: "Parking to water",
      value: a.parking_to_water_m != null ? metresLabel(a.parking_to_water_m) : "Unknown",
    },
    { icon: Toilet, label: "Accessible restroom", value: yesNoUnknown(a.accessible_restroom) },
    { icon: Layers, label: "Path surface", value: SURFACE_TEXT[a.surface] },
    { icon: AccessibilityIcon, label: "Beach / water wheelchair loaner", value: yesNoUnknown(a.wheelchair_loaner) },
    { icon: Hand, label: "Handrails at the entry", value: yesNoUnknown(a.handrails) },
    { icon: Sun, label: "Shade near the water", value: yesNoUnknown(a.shade) },
    { icon: Ruler, label: "Depth at the entry", value: textOrNotStated(a.depth_at_entry_note) },
    { icon: Dog, label: "Service animals", value: textOrNotStated(a.service_animals_note) },
  ];

  const accessible = isAccessibleEntry(a);

  return (
    <Section
      id="accessibility"
      title="Accessibility"
      icon={<AccessibilityIcon />}
      action={a.verified ? <Badge variant="verified" /> : <Badge variant="unverified" />}
    >
      <Card className="space-y-3">
        <p className={`flex items-center gap-2 text-sm font-extrabold ${accessible ? "text-status-open" : "text-cocoa"}`}>
          <AccessibilityIcon aria-hidden="true" focusable="false" className="size-5 shrink-0" />
          {accessible ? "Wheelchair-accessible water entry" : "Wheelchair-accessible water entry not confirmed"}
        </p>
        <dl className="divide-y divide-mist md:grid md:grid-cols-2 md:gap-x-6 md:divide-y-0">
          {rows.map((r) => {
            const Icon = r.icon;
            return (
              <div key={r.label} className="flex items-start gap-3 py-2 md:border-b md:border-mist">
                <dt className="flex min-w-0 flex-1 items-center gap-2 text-sm text-mocha">
                  <Icon aria-hidden="true" focusable="false" className="size-4 shrink-0 text-taupe" />
                  <span>{r.label}</span>
                </dt>
                <dd className="max-w-[55%] text-right text-sm font-bold text-cocoa">{r.value}</dd>
              </div>
            );
          })}
        </dl>
        <div className="space-y-1 border-t border-mist pt-3">
          <LastUpdated at={a.updated_at} source={a.source ?? "Source not stated"} prefix="Checked" />
          <p className="text-xs text-mocha">
            {a.verified
              ? "Verified against the park's official accessibility information."
              : "Not yet verified on site or with the park. Treat as a starting point and call ahead."}
          </p>
        </div>
      </Card>
    </Section>
  );
}
