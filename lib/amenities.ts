/**
 * How OSM amenity counts are shown. Pure: the component maps the icon name to a component,
 * so lib/ stays free of React imports.
 */
import type { AmenityKind, ParkAmenities } from "./types";

export type AmenityIcon =
  | "toilet"
  | "shower"
  | "water"
  | "grill"
  | "table"
  | "shelter"
  | "dock"
  | "ramp"
  | "boat"
  | "food"
  | "play";

interface AmenityMeta {
  /** Singular label. A count is appended only when there is more than one. */
  label: string;
  icon: AmenityIcon;
}

/**
 * Order matters: this is the order the chips appear, most-asked-about first. Restrooms
 * decide trips; a playground is a nice-to-know.
 */
const META: Record<AmenityKind, AmenityMeta> = {
  toilets: { label: "Restrooms", icon: "toilet" },
  shower: { label: "Showers", icon: "shower" },
  shelter: { label: "Pavilion", icon: "shelter" },
  picnic_table: { label: "Picnic tables", icon: "table" },
  bbq: { label: "Grills", icon: "grill" },
  drinking_water: { label: "Drinking water", icon: "water" },
  pier: { label: "Dock", icon: "dock" },
  slipway: { label: "Boat ramp", icon: "ramp" },
  boat_rental: { label: "Boat rental", icon: "boat" },
  cafe: { label: "Food", icon: "food" },
  playground: { label: "Playground", icon: "play" },
};

const ORDER = Object.keys(META) as AmenityKind[];

export interface AmenityChip {
  kind: AmenityKind;
  label: string;
  icon: AmenityIcon;
}

/**
 * Kinds whose count is a count of distinct facilities. Everything else is linear or
 * area infrastructure that OSM splits into segments: a single boardwalk pier can be
 * seventeen `man_made=pier` ways, and "Dock x17" is a mapping artefact presented as a
 * fact about the park.
 */
const COUNTABLE = new Set<AmenityKind>(["toilets", "shower", "shelter", "picnic_table", "bbq", "playground", "drinking_water"]);

/** Above this, a count is far more likely to be segmentation than a real tally. */
const MAX_SENSIBLE_COUNT = 9;

/**
 * Chips for what is mapped at this park.
 *
 * Counts are shown only above one, because "Restrooms" reads better than "1 Restrooms"
 * and "Restrooms x3" is the part that actually changes a decision at a busy park.
 */
export function amenityChips(amenities: ParkAmenities | null | undefined): AmenityChip[] {
  if (!amenities) return [];
  const out: AmenityChip[] = [];
  for (const kind of ORDER) {
    const count = amenities[kind];
    if (!count || count < 1) continue;
    const meta = META[kind];
    const showCount = count > 1 && COUNTABLE.has(kind) && count <= MAX_SENSIBLE_COUNT;
    out.push({ kind, label: showCount ? `${meta.label} ×${count}` : meta.label, icon: meta.icon });
  }
  return out;
}
