/**
 * USPS two-letter code to full state name. Park rows carry the code, but a heading
 * reading "MI" is not a place anyone recognises, and the list is only navigable if
 * the headings read like the map. Pure data, so it stays out of the components.
 */
const STATE_NAMES: Readonly<Record<string, string>> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

/** Full name for a USPS code, or null when the code is missing or unrecognised. */
export function stateName(code: string | null | undefined): string | null {
  if (!code) return null;
  return STATE_NAMES[code.trim().toUpperCase()] ?? null;
}

/** True when the code names a state we can render a heading for. */
export function isStateCode(value: unknown): value is string {
  return typeof value === "string" && stateName(value) !== null;
}

/** Canonical upper-case code, or null when unrecognised. Lets callers key maps safely. */
export function normalizeStateCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const upper = code.trim().toUpperCase();
  return upper in STATE_NAMES ? upper : null;
}
