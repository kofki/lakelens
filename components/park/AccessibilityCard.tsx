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
import type {Accessibility} from "@/lib/types";
import { isAccessibleEntry } from "@/lib/distance";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { Section } from "@/components/ui/Section";
import {ENTRY_TYPE_TEXT, SURFACE_TEXT, WATER_ACCESS_TEXT, metresLabel} from "./format";

export interface AccessibilityCardProps {
  accessibility: Accessibility | null;
}

interface RowDef {
  icon: LucideIcon;
  label: string;
  value: string;
}

/**
 * Accessibility facts we can actually state, as rows.
 *
 * Fields we do not know are left out rather than printed as "Unknown". A park with three
 * confirmed facts shows three rows; it no longer shows eleven, eight of which say nothing.
 * The section disappears entirely when there is nothing to say.
 */
export function AccessibilityCard({ accessibility }: AccessibilityCardProps) {
  if (!accessibility) return null;

  const a = accessibility;
  // A row only exists when the underlying field is known. `known()` returns null for
  // unknown enums and null booleans, and nulls are filtered out below.
  const known = (value: string | null | undefined): string | null => (value && value !== "Unknown" ? value : null);
  const yesNo = (v: boolean | null | undefined): string | null => (v == null ? null : v ? "Yes" : "No");

  const rows: RowDef[] = (
    [
      { icon: WavesLadder, label: "Water access for wheelchair users", value: known(WATER_ACCESS_TEXT[a.water_access]) },
      { icon: Footprints, label: "How you get in", value: known(ENTRY_TYPE_TEXT[a.entry_type]) },
      { icon: Car, label: "ADA parking", value: yesNo(a.ada_parking) },
      { icon: Ruler, label: "Parking to water", value: a.parking_to_water_m != null ? metresLabel(a.parking_to_water_m) : null },
      { icon: Toilet, label: "Accessible restroom", value: yesNo(a.accessible_restroom) },
      { icon: Layers, label: "Path surface", value: known(SURFACE_TEXT[a.surface]) },
      { icon: AccessibilityIcon, label: "Water wheelchair loaner", value: yesNo(a.wheelchair_loaner) },
      { icon: Hand, label: "Handrails at the entry", value: yesNo(a.handrails) },
      { icon: Sun, label: "Shade near the water", value: yesNo(a.shade) },
      { icon: Ruler, label: "Depth at the entry", value: known(a.depth_at_entry_note) },
      { icon: Dog, label: "Service animals", value: known(a.service_animals_note) },
    ] as { icon: RowDef["icon"]; label: string; value: string | null }[]
  )
    .filter((r): r is RowDef => r.value !== null);

  if (rows.length === 0) return null;

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
          {accessible ? "Wheelchair-accessible water entry" : "Accessibility details below"}
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
        <div className="border-t border-mist pt-3">
          <LastUpdated at={a.updated_at} source={a.source ?? undefined} prefix="Checked" />
        </div>
      </Card>
    </Section>
  );
}
