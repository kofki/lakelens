/**
 * scripts/build-seed.ts: turns data/*.json into supabase/seed.sql.
 *
 *   node --experimental-strip-types scripts/build-seed.ts        (npm run seed:build)
 *   node --experimental-strip-types scripts/build-seed.ts --check   validate only, write nothing
 *   ... --skip-basic   ignore the DATA-basic files even if present
 *   ... --skip-extra   ignore the DATA-extra files even if present
 *   ... --out <file>   write somewhere other than supabase/seed.sql
 *
 * Inputs (all under data/). "required" files belong to DATA-deep; every other
 * file is optional and silently tolerated when missing (a note is written into
 * the seed header instead).
 *
 *   parks.deep.json           { parks: ParkSeed[] }                  required  (DATA-deep)
 *   parks.extra.json          { parks: ParkSeed[] }                  optional  (DATA-extra)
 *   parks.basic.json          { parks: ParkSeed[] }                  optional  (DATA-basic)
 *   accessibility.json        { [slug]: AccessibilitySeed }          required  (DATA-deep)
 *   accessibility.extra.json  { [slug]: AccessibilitySeed }          optional  (DATA-extra)
 *   accessibility.basic.json  { [slug]: AccessibilitySeed }          optional  (DATA-basic)
 *   parking_lots.json         { lots: ParkingLotSeed[] }             required  (DATA-deep)
 *   parking_lots.extra.json   { lots: ParkingLotSeed[] }             optional  (DATA-extra)
 *   alerts.manual.json        { alerts: AlertSeed[] }                required  (DATA-deep)
 *   alerts.extra.json         { alerts: AlertSeed[] }                optional  (DATA-extra)
 *   sample_reports.json       { reports: SampleReportSeed[] }        required  (DATA-deep)
 *   events.json               { events: CalendarEvent[] }            required  (DATA-deep)
 *   holidays-2026-2027.json   { holidays, long_weekends }            optional  (DATA-basic)
 *   photos.json / photos.extra.json / photos.basic.json
 *                             { photos: { [slug]: PhotoCredit } }    optional  (attribution only,
 *                                                                    the park row carries photo_url)
 *   gauges.json               { [slug]: { usgs_site_id, river_gauge_site_id, gauge_distance_km } }
 *                             or { gauges: { ... } }                 optional  (FEEDS): fills any
 *                                                                    park whose gauge fields are null
 * Top-level keys starting with "_" (e.g. "_note") and "meta" are ignored in every file.
 *
 * Merge rules:
 *   - parks: deep ∪ extra ∪ basic, deduped by slug, precedence deep > extra > basic.
 *   - accessibility: keyed by slug, precedence accessibility.json > .extra > .basic.
 *   - parking lots / alerts: concatenated (deep file first).
 *   - photo credits: merged by slug, precedence photos.json > .extra > .basic.
 *   - gauges: only fill a park's usgs_site_id / river_gauge_site_id / gauge_distance_km when null.
 *
 * Output is idempotent, so it can be re-applied any time (e.g. before a demo to
 * refresh the sample-report timestamps):
 *   - parks:            insert ... on conflict (slug) do update
 *   - accessibility:    delete rows for parks that have a record, then insert
 *   - parking_lots:     delete source='curated' rows for parks that have lots, then insert
 *   - park_alerts:      delete source='manual' rows for parks that have alerts, then insert (hash = sha1)
 *   - reports:          delete where is_sample, then insert with created_at = now() - N minutes
 *   - holidays / long_weekends: upsert
 * NWS alerts (source='nws'), OSM lots (source='osm') and real user reports are never touched.
 *
 * This file deliberately imports nothing from lib/ so plain `node` can run it
 * (no path aliases, no bundler). tests/seed.test.ts asserts the enum mirrors
 * below match lib/types.ts.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Enum mirrors of lib/types.ts (frozen contract). Keep in sync; the test checks.
// ---------------------------------------------------------------------------
export const PARK_TYPES = ["spring", "lake", "river"] as const;
export const OPERATORS = ["state", "county", "private"] as const;
export const COVERAGE_TIERS = ["basic", "deep"] as const;
export const GUARDED = ["yes", "no", "unknown"] as const;
export const WATER_ACCESS = ["yes", "limited", "no", "unknown"] as const;
export const ENTRY_TYPES = ["ramp", "stairs", "dock_ladder", "sloped_bank", "sand", "other", "unknown"] as const;
export const SURFACES = ["paved", "boardwalk", "sand", "natural", "unknown"] as const;
export const ALERT_KINDS = ["closure", "notice", "nws"] as const;
export const REPORT_CATEGORIES = ["entry", "conditions", "parking", "accessibility"] as const;
export const REPORT_VALUES = {
  entry: ["got_in", "turned_away", "line"],
  conditions: ["crowded", "water_high", "water_murky", "gator", "launch_closed"],
  parking: ["lot_full", "overflow_open"],
  accessibility: ["ramp_blocked", "wheelchair_available", "restroom_closed"],
} as const;
export const ALL_REPORT_VALUES = [
  ...REPORT_VALUES.entry,
  ...REPORT_VALUES.conditions,
  ...REPORT_VALUES.parking,
  ...REPORT_VALUES.accessibility,
] as const;
export const PARKING_SOURCES = ["osm", "curated"] as const;

/** The deep-coverage parks curated in data/parks.deep.json, in display order. */
export const DEEP_SLUGS = [
  "ichetucknee-springs-state-park",
  "ginnie-springs",
  "poe-springs-park",
  "gilchrist-blue-springs-state-park",
  "rainbow-springs-state-park",
  "blue-spring-state-park",
  "wekiwa-springs-state-park",
  "madison-blue-spring-state-park",
  "fanning-springs-state-park",
  "manatee-springs-state-park",
  "de-leon-springs-state-park",
  "weeki-wachee-springs-state-park",
  "lafayette-blue-springs-state-park",
  "troy-spring-state-park",
  "kelly-park-rock-springs",
] as const;

// ---------------------------------------------------------------------------
// Zod schemas (mirror lib/types.ts row shapes minus generated columns)
// ---------------------------------------------------------------------------
const dateYMD = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "expected YYYY-MM-DD");
const monthDay = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "expected MM-DD");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM (24h)");
const isoTimestamp = z
  .string()
  .refine((s) => /^\d{4}-\d{2}-\d{2}T/.test(s) && !Number.isNaN(Date.parse(s)), "expected ISO 8601 timestamp");
const httpUrl = z.string().regex(/^https?:\/\/\S+$/, "expected http(s) URL");
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "expected kebab-case slug");
const usgsSite = z.string().regex(/^\d{8,15}$/, "expected USGS site number (8-15 digits)");
const nonEmpty = z.string().trim().min(1);
/** Local photo path (may live in a sub-folder such as /photos/basic/) or an absolute http(s) URL. */
const localPhotoPath = /^\/photos\/[a-z0-9-]+(?:\/[a-z0-9-]+)*\.(jpg|jpeg|png|webp)$/;

export const ParkRulesSchema = z.strictObject({
  alcohol: z.string().optional(),
  tubing: z.string().optional(),
  pets: z.string().optional(),
  life_jackets: z.string().optional(),
  other: z.array(z.string()).optional(),
});

export const SwimSeasonSchema = z.strictObject({
  open: monthDay,
  close: monthDay,
  note: z.string().optional(),
});

export const NwsGridSchema = z.strictObject({
  gridId: z.string().regex(/^[A-Z]{3}$/),
  gridX: z.number().int().nonnegative(),
  gridY: z.number().int().nonnegative(),
  forecast: httpUrl,
  forecastHourly: httpUrl,
});

const parkSeedShape = {
  slug,
  name: nonEmpty,
  type: z.enum(PARK_TYPES),
  /** Two-letter USPS code. Optional so the Florida-era files stay valid; defaulted below. */
  state: z.string().regex(/^[A-Z]{2}$/).nullable().optional(),
  operator: z.enum(OPERATORS),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  coverage_tier: z.enum(COVERAGE_TIERS),
  swimming_verified: z.boolean(),
  guarded: z.enum(GUARDED),
  hours: z.string().nullable(),
  fees: z.string().nullable(),
  reservation_required: z.boolean(),
  reservation_url: httpUrl.nullable(),
  rules: ParkRulesSchema,
  usgs_site_id: usgsSite.nullable(),
  river_gauge_site_id: usgsSite.nullable(),
  gauge_distance_km: z.number().nonnegative().nullable(),
  nws_grid: NwsGridSchema.nullable(),
  nws_zone: z.string().regex(/^[A-Z]{2}Z\d{3}$/).nullable(),
  nws_county: z.string().regex(/^[A-Z]{2}C\d{3}$/).nullable(),
  typical_closure_time: hhmm.nullable(),
  cavern_warning: z.boolean(),
  safety_notes: z.string().nullable(),
  official_url: httpUrl.nullable(),
  photo_url: z
    .string()
    .refine((s) => localPhotoPath.test(s) || /^https?:\/\/\S+$/.test(s), "expected /photos/<...>.jpg or http(s) URL")
    .nullable(),
  /** Credit for photo_url, stitched on from data/photos*.json rather than authored here. */
  photo_author: z.string().nullable().optional(),
  photo_license: z.string().nullable().optional(),
  photo_source_url: httpUrl.nullable().optional(),
  entrance_notes: z.string().nullable(),
  swim_season: SwimSeasonSchema.nullable(),
  description: z.string().nullable(),
  /** The named lake, river or spring this swim area is on. Verified, not assumed. */
  water_body: z.string().nullable().optional(),
  /** Nearest town, for the "Town, ST" line on a card. */
  city: z.string().nullable().optional(),
  sources: z.array(nonEmpty).min(1),
};
/** Strict: used for data/parks.deep.json (our own file). */
export const ParkSeedSchema = z.strictObject(parkSeedShape);
/** Lenient (unknown keys stripped): used for parks.extra.json / parks.basic.json (other packages' files). */
export const ParkSeedLenientSchema = z.object(parkSeedShape);
export type ParkSeed = z.infer<typeof ParkSeedSchema>;

const accessibilitySeedShape = {
  water_access: z.enum(WATER_ACCESS),
  entry_type: z.enum(ENTRY_TYPES),
  ada_parking: z.boolean().nullable(),
  parking_to_water_m: z.number().int().nonnegative().nullable(),
  accessible_restroom: z.boolean().nullable(),
  surface: z.enum(SURFACES),
  wheelchair_loaner: z.boolean().nullable(),
  handrails: z.boolean().nullable(),
  shade: z.boolean().nullable(),
  depth_at_entry_note: z.string().nullable(),
  service_animals_note: z.string().nullable(),
  verified: z.boolean(),
  source: z.string().nullable(),
  sources: z.array(nonEmpty).min(1),
};
export const AccessibilitySeedSchema = z.strictObject(accessibilitySeedShape);
export const AccessibilitySeedLenientSchema = z.object(accessibilitySeedShape);
export type AccessibilitySeed = z.infer<typeof AccessibilitySeedSchema>;

export const ParkingLotSeedSchema = z.strictObject({
  park_slug: slug,
  name: nonEmpty,
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  fee: z.string().nullable(),
  capacity: z.number().int().nonnegative().nullable(),
  ada_spaces: z.number().int().nonnegative().nullable(),
  is_overflow: z.boolean(),
  source: z.enum(PARKING_SOURCES),
  notes: z.string().nullable(),
});
export type ParkingLotSeed = z.infer<typeof ParkingLotSeedSchema>;

export const AlertSeedSchema = z
  .strictObject({
    park_slug: slug,
    kind: z.enum(ALERT_KINDS),
    text: z.string().trim().min(10),
    source: nonEmpty,
    official_url: httpUrl.nullable(),
    severity: z.string().nullable(),
    starts_at: isoTimestamp.nullable(),
    ends_at: isoTimestamp.nullable(),
    active: z.boolean(),
  })
  .refine((a) => !a.starts_at || !a.ends_at || Date.parse(a.ends_at) >= Date.parse(a.starts_at), {
    message: "ends_at must be on or after starts_at",
    path: ["ends_at"],
  });
export type AlertSeed = z.infer<typeof AlertSeedSchema>;

export const SampleReportSeedSchema = z
  .strictObject({
    park_slug: slug,
    category: z.enum(REPORT_CATEGORIES),
    value: z.enum(ALL_REPORT_VALUES),
    note: z.string().max(280).nullable().optional(),
    minutes_ago: z.number().int().nonnegative(),
  })
  .refine((r) => (REPORT_VALUES[r.category] as readonly string[]).includes(r.value), {
    message: "value does not belong to category (see REPORT_VALUES in lib/types.ts)",
    path: ["value"],
  });
export type SampleReportSeed = z.infer<typeof SampleReportSeedSchema>;

export const SampleReviewSeedSchema = z.strictObject({
  park_slug: slug,
  rating: z.number().int().min(1).max(5),
  body: z.string().max(1000).nullable().optional(),
  days_ago: z.number().int().nonnegative(),
});
export type SampleReviewSeed = z.infer<typeof SampleReviewSeedSchema>;

export const CalendarEventSchema = z
  .strictObject({
    start: dateYMD,
    end: dateYMD,
    name: nonEmpty,
    weight: z.number().int().min(1).max(3).optional(),
  })
  .refine((e) => e.end >= e.start, { message: "end must be on or after start", path: ["end"] });
export type CalendarEventSeed = z.infer<typeof CalendarEventSchema>;

export const HolidaySchema = z.object({ date: dateYMD, name: nonEmpty });
export const LongWeekendSchema = z
  .object({ start_date: dateYMD, end_date: dateYMD })
  .refine((w) => w.end_date >= w.start_date, { message: "end_date must be on or after start_date", path: ["end_date"] });

export const PhotoCreditSchema = z
  .object({
    /**
     * A curated photo is a file we committed; a harvested one is a Wikimedia Commons
     * thumbnail we hotlink. Both are allowed, and both carry the same attribution, which is
     * the point of this record.
     */
    file: z
      .string()
      .refine((v) => localPhotoPath.test(v) || /^https:\/\/\S+$/.test(v), "expected /photos/<...>.jpg or an https URL"),
    title: nonEmpty,
    /** Null only for public-domain works with no named creator (e.g. US federal photography). */
    author: nonEmpty.nullable(),
    license: nonEmpty,
    license_url: httpUrl.nullable(),
    source_url: httpUrl,
  })
  .refine((c) => c.author !== null || /public domain|^pd[- ]|^cc0/i.test(c.license), {
    message: "author may only be null for public-domain works",
    path: ["author"],
  });
export type PhotoCredit = z.infer<typeof PhotoCreditSchema>;

/** data/gauges.json (FEEDS): slug -> gauge ids. Every field optional/nullable so partial rows are fine. */
export const GaugeSeedSchema = z.object({
  usgs_site_id: usgsSite.nullable().optional(),
  river_gauge_site_id: usgsSite.nullable().optional(),
  gauge_distance_km: z.number().nonnegative().nullable().optional(),
});
export type GaugeSeed = z.infer<typeof GaugeSeedSchema>;

// File wrappers (non-strict so "_note"/"meta" keys are tolerated).
export const ParksFileSchema = z.object({ parks: z.array(ParkSeedSchema).min(1) });
export const ParksLenientFileSchema = z.object({ parks: z.array(ParkSeedLenientSchema) });
/** @deprecated alias kept for older imports */
export const ParksBasicFileSchema = ParksLenientFileSchema;
export const AccessibilityFileSchema = z.record(slug, AccessibilitySeedSchema);
export const AccessibilityLenientFileSchema = z.record(slug, AccessibilitySeedLenientSchema);
export const ParkingLotsFileSchema = z.object({ lots: z.array(ParkingLotSeedSchema) });
export const AlertsFileSchema = z.object({ alerts: z.array(AlertSeedSchema) });
export const SampleReportsFileSchema = z.object({ reports: z.array(SampleReportSeedSchema) });
export const SampleReviewsFileSchema = z.object({ reviews: z.array(SampleReviewSeedSchema) });
export const EventsFileSchema = z.object({ events: z.array(CalendarEventSchema) });
export const HolidaysFileSchema = z.object({
  holidays: z.array(HolidaySchema),
  long_weekends: z.array(LongWeekendSchema).default([]),
});
export const PhotosFileSchema = z.object({ photos: z.record(slug, PhotoCreditSchema) });
export const GaugesMapSchema = z.record(slug, GaugeSeedSchema);
/** Accepts either { gauges: { [slug]: ... } } or a bare { [slug]: ... } map. */
export const GaugesFileSchema = z.union([z.object({ gauges: GaugesMapSchema }).transform((o) => o.gauges), GaugesMapSchema]);

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const DATA_FILES = {
  deep: "data/parks.deep.json",
  extra: "data/parks.extra.json",
  basic: "data/parks.basic.json",
  osm: "data/parks.osm.json",
  accessibility: "data/accessibility.json",
  accessibilityExtra: "data/accessibility.extra.json",
  accessibilityBasic: "data/accessibility.basic.json",
  lots: "data/parking_lots.json",
  lotsExtra: "data/parking_lots.extra.json",
  alerts: "data/alerts.manual.json",
  alertsExtra: "data/alerts.extra.json",
  sampleReports: "data/sample_reports.json",
  sampleReviews: "data/sample_reviews.json",
  events: "data/events.json",
  holidays: "data/holidays-2026-2027.json",
  photos: "data/photos.json",
  photosExtra: "data/photos.extra.json",
  photosBasic: "data/photos.basic.json",
  photosOsm: "data/photos.osm.json",
  osmDetails: "data/park-details.osm.json",
  waterBodies: "data/water-bodies.osm.json",
  places: "data/places.json",
  gauges: "data/gauges.json",
} as const;

/** Drops top-level "_..." and "meta" keys so annotated JSON files validate cleanly. */
export function stripMetaKeys<T>(value: T): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k.startsWith("_") || k === "meta") continue;
    out[k] = v;
  }
  return out as T;
}

export class SeedValidationError extends Error {
  readonly file: string;
  readonly issues: string[];
  constructor(file: string, issues: string[]) {
    super(`${file}: ${issues.length} validation issue(s)\n  - ${issues.join("\n  - ")}`);
    this.name = "SeedValidationError";
    this.file = file;
    this.issues = issues;
  }
}

function readJson(path: string): unknown {
  return stripMetaKeys(JSON.parse(readFileSync(path, "utf8")));
}

function parseFile<S extends z.ZodType>(schema: S, path: string, relName: string): z.infer<S> {
  const result = schema.safeParse(readJson(path));
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new SeedValidationError(relName, issues);
  }
  return result.data;
}

export type ParkTier = "deep" | "extra" | "basic";

export interface SeedData {
  /** data/parks.deep.json as-is (after gauge fill). */
  deepParks: ParkSeed[];
  /** data/parks.extra.json rows whose slug is NOT already in deep (after gauge fill). */
  extraParks: ParkSeed[];
  /** data/parks.basic.json rows whose slug is NOT already in deep or extra (after gauge fill). */
  basicParks: ParkSeed[];
  /** All parks, deduped by slug, in precedence order deep > extra > basic. */
  parks: ParkSeed[];
  /** Which file each merged park came from. */
  tierBySlug: Record<string, ParkTier>;
  /** Merged accessibility keyed by slug (accessibility.json > .extra > .basic). */
  accessibility: Record<string, AccessibilitySeed>;
  lots: ParkingLotSeed[];
  alerts: AlertSeed[];
  sampleReports: SampleReportSeed[];
  sampleReviews: SampleReviewSeed[];
  events: CalendarEventSeed[];
  holidays: z.infer<typeof HolidaysFileSchema> | null;
  /** Merged photo credits keyed by slug (photos.json > .extra > .basic). Attribution only. */
  photos: Record<string, PhotoCredit>;
  /** data/gauges.json as loaded (empty when absent). */
  gauges: Record<string, GaugeSeed>;
  /** Human-readable notes about optional inputs that were skipped or merged. */
  warnings: string[];
}

export interface LoadOptions {
  skipBasic?: boolean;
  skipExtra?: boolean;
}

/** Fill null gauge fields from data/gauges.json; never overrides a value the park already has. */
export function applyGauges(park: ParkSeed, gauge: GaugeSeed | undefined): ParkSeed {
  if (!gauge) return park;
  const out = { ...park };
  if (out.usgs_site_id == null && gauge.usgs_site_id) out.usgs_site_id = gauge.usgs_site_id;
  if (out.river_gauge_site_id == null && gauge.river_gauge_site_id) out.river_gauge_site_id = gauge.river_gauge_site_id;
  if (out.gauge_distance_km == null && gauge.gauge_distance_km != null) out.gauge_distance_km = gauge.gauge_distance_km;
  return out;
}

/**
 * CC BY obliges us to name the author wherever the photo is shown, so the credit has to reach
 * the park row: the app renders from parks, never from data/photos*.json. The file check keeps a
 * credit from landing on a park whose photo_url has since been pointed somewhere else.
 */
/**
 * Attach a photo and the credit its licence requires.
 *
 * Two cases. A curated park already names its own photo file, and the record only supplies
 * the attribution. A harvested park has no photo at all, and the record supplies both: the
 * Commons thumbnail URL becomes its photo_url. Either way the credit and the image come
 * from the same record, so a park can never end up showing one person's photograph under
 * another person's name.
 */
export function applyPhotoCredit(park: ParkSeed, credit: PhotoCredit | undefined): ParkSeed {
  if (!credit) return park;
  if (park.photo_url && credit.file !== park.photo_url) return park;
  return {
    ...park,
    photo_url: park.photo_url ?? credit.file,
    photo_author: credit.author,
    photo_license: credit.license,
    // source_url is the Commons file page, which is where the licence and author can be checked.
    photo_source_url: credit.source_url,
  };
}

/**
 * Tags harvested from the OSM element a community park came from.
 *
 * Every field is optional because OSM coverage is thin: `opening_hours` is set on 6 of 575
 * parks. A field that is absent leaves the seed's own value alone rather than nulling it.
 */
export const OsmDetailSchema = z.object({
  osm_ref: z.string(),
  opening_hours: z.string().optional(),
  /** Prose lib/openingHours.ts can parse. Only present when the raw value converted cleanly. */
  hours_text: z.string().nullable().optional(),
  hours_converted: z.boolean().optional(),
  fee: z.string().optional(),
  website: z.string().optional(),
  operator: z.string().optional(),
  phone: z.string().optional(),
  description: z.string().optional(),
  supervised: z.string().optional(),
  dog: z.string().optional(),
});
export type OsmDetail = z.infer<typeof OsmDetailSchema>;
export const OsmDetailsFileSchema = z.object({ details: z.record(slug, OsmDetailSchema) });

export const WaterVerdictSchema = z.object({
  water_body: z.string().nullable(),
  type: z.enum(PARK_TYPES).nullable(),
  great_lake: z.boolean(),
  reason: z.string(),
});
export type WaterVerdict = z.infer<typeof WaterVerdictSchema>;
export const WaterBodiesFileSchema = z.object({ verdicts: z.record(slug, WaterVerdictSchema) });

/** OSM's `fee` is yes/no/donation; anything else is free text we will not guess at. */
const FEE_TEXT: Record<string, string> = {
  no: "Free.",
  yes: "There is a fee.",
  donation: "Donation requested.",
};

/**
 * Fold an OSM element's tags into its park row.
 *
 * Only tags that were actually present are applied, and only onto fields the harvest left
 * null. A curated value always wins: this is community data filling gaps, not correcting
 * work someone did by hand.
 */
export function applyOsmDetails(park: ParkSeed, detail: OsmDetail | undefined): ParkSeed {
  if (!detail) return park;
  const next = { ...park };
  // hours_text is set only when the converter was confident. The raw OSM syntax is not
  // shown to anyone: "Mo-Su 07:00-21:00" is not an answer to "when does it close".
  if (!next.hours && detail.hours_converted && detail.hours_text) next.hours = detail.hours_text;
  if (!next.fees && detail.fee && FEE_TEXT[detail.fee]) next.fees = FEE_TEXT[detail.fee]!;
  if (!next.official_url && detail.website && /^https?:\/\/\S+$/.test(detail.website)) next.official_url = detail.website;
  if (!next.description && detail.description) next.description = detail.description;
  // `supervised` is OSM's word for a lifeguard. It is the single best-covered tag here (84
  // parks), and it turns "unknown" into a real answer on the safety card.
  if (next.guarded === "unknown" && (detail.supervised === "yes" || detail.supervised === "no")) {
    next.guarded = detail.supervised;
  }
  // OSM's `dog` is yes/no/leashed. `rules.pets` is prose, so it is written as prose.
  const DOG_TEXT: Record<string, string> = {
    yes: "Dogs allowed.",
    no: "No dogs.",
    leashed: "Dogs allowed on a leash.",
  };
  if (!next.rules.pets && detail.dog && DOG_TEXT[detail.dog]) {
    next.rules = { ...next.rules, pets: DOG_TEXT[detail.dog]! };
  }
  return next;
}

/**
 * Apply what we learned about the water, or drop the park.
 *
 * The harvest typed every community row "lake" without checking, which is how a river
 * sandbar and a Great Lakes city beach ended up indistinguishable. A row survives only if
 * it can name fresh water nearby; `null` here means it cannot, and the caller leaves it out
 * of the seed entirely.
 */
/**
 * States with an ocean in them.
 *
 * In these, `natural=beach` means nothing on its own, so an unchecked row is an ocean beach
 * until proven otherwise. Everywhere else a beach is fresh water by geography and a missing
 * verdict costs nothing.
 */
export const SALT_COAST_STATES = new Set([
  "AK", "AL", "CA", "CT", "DC", "DE", "FL", "GA", "HI", "LA", "MA", "MD", "ME", "MS", "NC",
  "NH", "NJ", "NY", "OR", "RI", "SC", "TX", "VA", "WA",
]);

export function applyWaterVerdict(park: ParkSeed, verdict: WaterVerdict | undefined): ParkSeed | null {
  if (!verdict) {
    // A missing verdict is "not checked yet", not "checked and passed". In a landlocked
    // state that is harmless. On the coast it is the whole question, and publishing on the
    // assumption would have put 406 Massachusetts sea beaches on a freshwater map.
    return park.state && SALT_COAST_STATES.has(park.state) ? null : park;
  }
  if (!verdict.water_body || !verdict.type) return null;
  return { ...park, type: verdict.type, water_body: verdict.water_body };
}

export const PlaceSchema = z.object({
  city: z.string().nullable(),
  state: z.string().regex(/^[A-Z]{2}$/).nullable(),
});
export type Place = z.infer<typeof PlaceSchema>;
export const PlacesFileSchema = z.object({ places: z.record(slug, PlaceSchema) });

/**
 * Attach the nearest town.
 *
 * The state is only filled in when the row has none. Where both disagree the harvest's
 * value wins: it came from a state boundary query, which is exact, whereas this came from
 * a reverse geocode of a point that may sit on a lake straddling a border.
 */
export function applyPlace(park: ParkSeed, place: Place | undefined): ParkSeed {
  if (!place) return park;
  return {
    ...park,
    city: park.city ?? place.city,
    state: park.state ?? place.state,
  };
}

export function loadSeedData(root: string = REPO_ROOT, opts: LoadOptions = {}): SeedData {
  const p = (rel: string) => resolve(root, rel);
  const warnings: string[] = [];

  /** Parse an optional file; returns null (and records a note) when it is absent or skipped. */
  function optional<S extends z.ZodType>(schema: S, rel: string, skipped: boolean, skipFlag: string): z.infer<S> | null {
    if (skipped) {
      warnings.push(`${rel}: skipped (${skipFlag})`);
      return null;
    }
    if (!existsSync(p(rel))) {
      warnings.push(`${rel}: not found, skipped`);
      return null;
    }
    return parseFile(schema, p(rel), rel);
  }

  // Required (DATA-deep) files.
  const deepRaw = parseFile(ParksFileSchema, p(DATA_FILES.deep), DATA_FILES.deep).parks;
  const accessibilityDeep = parseFile(AccessibilityFileSchema, p(DATA_FILES.accessibility), DATA_FILES.accessibility);
  const lotsDeep = parseFile(ParkingLotsFileSchema, p(DATA_FILES.lots), DATA_FILES.lots).lots;
  const alertsDeep = parseFile(AlertsFileSchema, p(DATA_FILES.alerts), DATA_FILES.alerts).alerts;
  const sampleReports = parseFile(SampleReportsFileSchema, p(DATA_FILES.sampleReports), DATA_FILES.sampleReports).reports;
  const sampleReviews = parseFile(SampleReviewsFileSchema, p(DATA_FILES.sampleReviews), DATA_FILES.sampleReviews).reviews;
  const events = parseFile(EventsFileSchema, p(DATA_FILES.events), DATA_FILES.events).events;

  // Optional files.
  const skipExtra = Boolean(opts.skipExtra);
  const skipBasic = Boolean(opts.skipBasic);
  const extraRaw = optional(ParksLenientFileSchema, DATA_FILES.extra, skipExtra, "--skip-extra")?.parks ?? [];
  const basicRaw = optional(ParksLenientFileSchema, DATA_FILES.basic, skipBasic, "--skip-basic")?.parks ?? [];
  // Lowest precedence: community data from OpenStreetMap, which a curated row always wins over.
  const osmRaw = optional(ParksLenientFileSchema, DATA_FILES.osm, skipBasic, "--skip-basic")?.parks ?? [];
  const accessibilityExtra = optional(AccessibilityLenientFileSchema, DATA_FILES.accessibilityExtra, skipExtra, "--skip-extra") ?? {};
  const accessibilityBasic = optional(AccessibilityLenientFileSchema, DATA_FILES.accessibilityBasic, skipBasic, "--skip-basic") ?? {};
  const lotsExtra = optional(ParkingLotsFileSchema, DATA_FILES.lotsExtra, skipExtra, "--skip-extra")?.lots ?? [];
  const alertsExtra = optional(AlertsFileSchema, DATA_FILES.alertsExtra, skipExtra, "--skip-extra")?.alerts ?? [];
  const holidays = optional(HolidaysFileSchema, DATA_FILES.holidays, skipBasic, "--skip-basic");
  const photosDeep = optional(PhotosFileSchema, DATA_FILES.photos, false, "")?.photos ?? {};
  const photosExtra = optional(PhotosFileSchema, DATA_FILES.photosExtra, skipExtra, "--skip-extra")?.photos ?? {};
  const photosBasic = optional(PhotosFileSchema, DATA_FILES.photosBasic, skipBasic, "--skip-basic")?.photos ?? {};
  // Commons photos found by coordinates. Lowest precedence: a curated photo of the right
  // park always beats a proximity match.
  const photosOsm = optional(PhotosFileSchema, DATA_FILES.photosOsm, skipBasic, "--skip-basic")?.photos ?? {};
  const osmDetails = optional(OsmDetailsFileSchema, DATA_FILES.osmDetails, skipBasic, "--skip-basic")?.details ?? {};
  const waterBodies = optional(WaterBodiesFileSchema, DATA_FILES.waterBodies, skipBasic, "--skip-basic")?.verdicts ?? {};
  const places = optional(PlacesFileSchema, DATA_FILES.places, false, "")?.places ?? {};
  const gauges = optional(GaugesFileSchema, DATA_FILES.gauges, false, "") ?? {};

  // Photo credits merge first: the park rows below are built with their credit already attached.
  const photos: Record<string, PhotoCredit> = { ...photosOsm, ...photosBasic, ...photosExtra, ...photosDeep };

  // Merge parks: deep > extra > basic > osm, deduped by slug.
  const tierBySlug: Record<string, ParkTier> = {};
  const parks: ParkSeed[] = [];
  const deepParks: ParkSeed[] = [];
  const extraParks: ParkSeed[] = [];
  const basicParks: ParkSeed[] = [];
  /**
   * `enrich` is where community rows earn their place. It may return null, which drops the
   * row: an OSM swim area that cannot name the fresh water it sits on is not published.
   */
  const take = (
    rows: ParkSeed[],
    tier: ParkTier,
    into: ParkSeed[],
    enrich: (row: ParkSeed) => ParkSeed | null = (row) => row,
  ) => {
    let skipped = 0;
    let dropped = 0;
    for (const row of rows) {
      if (tierBySlug[row.slug]) {
        skipped++;
        continue;
      }
      const enriched = enrich(row);
      if (!enriched) {
        dropped++;
        continue;
      }
      const park = applyPlace(
        applyPhotoCredit(applyGauges(enriched, gauges[enriched.slug]), photos[enriched.slug]),
        places[enriched.slug],
      );
      tierBySlug[park.slug] = tier;
      into.push(park);
      parks.push(park);
    }
    if (skipped) warnings.push(`${tier} tier: ${skipped} row(s) skipped because the slug is already covered by a higher tier`);
    if (dropped) warnings.push(`${tier} tier: ${dropped} row(s) dropped because they could not name fresh water nearby`);
  };
  take(deepRaw, "deep", deepParks);
  take(extraRaw, "extra", extraParks);
  take(basicRaw, "basic", basicParks);
  // OSM rows join the basic tier: same coverage, different provenance. They are the only
  // rows nobody curated, so they are the only ones that have to prove their water.
  take(osmRaw, "basic", basicParks, (row) =>
    applyWaterVerdict(applyOsmDetails(row, osmDetails[row.slug]), waterBodies[row.slug]),
  );

  /**
   * A credit for a park that is not in the seed is an orphan, not a mistake in the photo
   * file. The water check drops rows after the photo harvest has already found pictures for
   * them, so a credit can outlive its park by one build.
   */
  const publishedSlugs = new Set(parks.map((row) => row.slug));
  const photosForPublishedParks = Object.fromEntries(
    Object.entries(photos).filter(([photoSlug]) => publishedSlugs.has(photoSlug)),
  );
  const orphanedPhotos = Object.keys(photos).length - Object.keys(photosForPublishedParks).length;
  if (orphanedPhotos) warnings.push(`photos: ${orphanedPhotos} credit(s) ignored for parks not in the seed`);

  // Merge accessibility: lower tiers never override a higher tier's record.
  const accessibility: Record<string, AccessibilitySeed> = { ...accessibilityBasic, ...accessibilityExtra, ...accessibilityDeep };

  return {
    deepParks,
    extraParks,
    basicParks,
    parks,
    tierBySlug,
    accessibility,
    lots: [...lotsDeep, ...lotsExtra],
    alerts: [...alertsDeep, ...alertsExtra],
    sampleReports,
    sampleReviews,
    events,
    holidays,
    photos: photosForPublishedParks,
    gauges,
    warnings,
  };
}

/**
 * Cross-file checks that zod cannot express: referenced slugs exist, no duplicate
 * slugs inside a file, photo files exist, deep parks are complete. Returns a list of problems.
 */
export function validateReferences(data: SeedData, root: string = REPO_ROOT): string[] {
  const problems: string[] = [];
  const deepSlugs = new Set(data.deepParks.map((x) => x.slug));
  const allSlugs = new Set(data.parks.map((x) => x.slug));

  // Duplicate slugs inside one tier are a data bug (across tiers they are deduped by precedence).
  const seenDeep = new Set<string>();
  for (const park of data.deepParks) {
    if (seenDeep.has(park.slug)) problems.push(`parks.deep.json: duplicate slug ${park.slug}`);
    seenDeep.add(park.slug);
    if (park.coverage_tier !== "deep") problems.push(`parks.deep.json: ${park.slug} must have coverage_tier "deep"`);
    if (park.photo_url && park.photo_url.startsWith("/photos/")) {
      if (!data.photos[park.slug]) problems.push(`photos.json: missing credit for deep park ${park.slug}`);
      else if (data.photos[park.slug].file !== park.photo_url) {
        problems.push(`photos.json: ${park.slug} file ${data.photos[park.slug].file} != photo_url ${park.photo_url}`);
      }
    }
  }
  for (const s of DEEP_SLUGS) if (!deepSlugs.has(s)) problems.push(`parks.deep.json: missing expected deep park ${s}`);

  const seenBasic = new Set<string>();
  for (const park of data.basicParks) {
    if (seenBasic.has(park.slug)) problems.push(`parks.basic.json: duplicate slug ${park.slug}`);
    seenBasic.add(park.slug);
    if (park.coverage_tier !== "basic") problems.push(`parks.basic.json: ${park.slug} must have coverage_tier "basic"`);
  }
  const seenExtra = new Set<string>();
  for (const park of data.extraParks) {
    if (seenExtra.has(park.slug)) problems.push(`parks.extra.json: duplicate slug ${park.slug}`);
    seenExtra.add(park.slug);
  }

  // Every local photo path must resolve to a file under public/ (any tier).
  for (const park of data.parks) {
    if (park.photo_url && park.photo_url.startsWith("/photos/")) {
      if (!existsSync(resolve(root, "public", park.photo_url.slice(1)))) {
        problems.push(`parks (${data.tierBySlug[park.slug]}): ${park.slug} photo_url ${park.photo_url} has no file under public/`);
      }
    }
  }

  for (const s of Object.keys(data.accessibility)) {
    if (!allSlugs.has(s)) problems.push(`accessibility: unknown park slug ${s}`);
  }
  for (const s of deepSlugs) if (!data.accessibility[s]) problems.push(`accessibility.json: no record for deep park ${s}`);

  data.lots.forEach((lot, i) => {
    if (!allSlugs.has(lot.park_slug)) problems.push(`parking_lots[${i}]: unknown park slug ${lot.park_slug}`);
  });
  for (const s of deepSlugs) {
    if (!data.lots.some((l) => l.park_slug === s)) problems.push(`parking_lots.json: no lot for deep park ${s}`);
  }
  data.alerts.forEach((a, i) => {
    if (!allSlugs.has(a.park_slug)) problems.push(`alerts[${i}]: unknown park slug ${a.park_slug}`);
    if (a.source === "nws") problems.push(`alerts[${i}]: source "nws" is reserved for the ingest job`);
  });
  data.sampleReports.forEach((r, i) => {
    if (!allSlugs.has(r.park_slug)) problems.push(`sample_reports.json[${i}]: unknown park slug ${r.park_slug}`);
  });
  data.sampleReviews.forEach((r, i) => {
    if (!allSlugs.has(r.park_slug)) problems.push(`sample_reviews.json[${i}]: unknown park slug ${r.park_slug}`);
  });
  for (const s of Object.keys(data.photos)) {
    if (!allSlugs.has(s)) problems.push(`photos: unknown park slug ${s}`);
  }
  for (const s of Object.keys(data.gauges)) {
    if (!allSlugs.has(s)) problems.push(`gauges.json: unknown park slug ${s}`);
  }
  return problems;
}

// ---------------------------------------------------------------------------
// SQL generation
// ---------------------------------------------------------------------------
const sqlString = (s: string) => `'${s.replace(/'/g, "''")}'`;

export function sqlLiteral(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`non-finite number in seed: ${v}`);
    return String(v);
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  return sqlString(v);
}

export function sqlJsonb(v: unknown): string {
  if (v === null || v === undefined) return "null";
  return `${sqlString(JSON.stringify(v))}::jsonb`;
}

const ident = (name: string) => `"${name}"`;
const parkIdBySlug = (s: string) => `(select id from public.parks where slug = ${sqlString(s)})`;

/** sha1 hex of park_slug|kind|starts_at|text: the park_alerts.hash dedupe key for manual alerts. */
export function alertHash(a: Pick<AlertSeed, "park_slug" | "kind" | "starts_at" | "text">): string {
  return createHash("sha1").update(`${a.park_slug}|${a.kind}|${a.starts_at ?? ""}|${a.text.trim()}`).digest("hex");
}

/** Deterministic, valid (v4-shaped) UUID for sample reports so re-seeding is stable. */
export function sampleDeviceId(seed: string): string {
  const h = createHash("sha1").update(`lakelens-sample-device|${seed}`).digest("hex");
  const v = h.slice(0, 12) + "4" + h.slice(13, 16) + "8" + h.slice(17, 20) + h.slice(20, 32);
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20, 32)}`;
}

const PARK_COLUMNS = [
  "slug",
  "name",
  "type",
  "state",
  "operator",
  "lat",
  "lng",
  "coverage_tier",
  "swimming_verified",
  "guarded",
  "hours",
  "fees",
  "reservation_required",
  "reservation_url",
  "rules",
  "usgs_site_id",
  "river_gauge_site_id",
  "gauge_distance_km",
  "nws_grid",
  "nws_zone",
  "nws_county",
  "typical_closure_time",
  "cavern_warning",
  "safety_notes",
  "official_url",
  "photo_url",
  "photo_author",
  "photo_license",
  "photo_source_url",
  "entrance_notes",
  "swim_season",
  "description",
  "water_body",
  "city",
] as const;

function parkValues(p: ParkSeed): string {
  const v: Record<(typeof PARK_COLUMNS)[number], string> = {
    slug: sqlLiteral(p.slug),
    name: sqlLiteral(p.name),
    type: sqlLiteral(p.type),
    state: sqlLiteral(p.state ?? null),
    operator: sqlLiteral(p.operator),
    lat: sqlLiteral(p.lat),
    lng: sqlLiteral(p.lng),
    coverage_tier: sqlLiteral(p.coverage_tier),
    swimming_verified: sqlLiteral(p.swimming_verified),
    guarded: sqlLiteral(p.guarded),
    hours: sqlLiteral(p.hours),
    fees: sqlLiteral(p.fees),
    reservation_required: sqlLiteral(p.reservation_required),
    reservation_url: sqlLiteral(p.reservation_url),
    rules: sqlJsonb(p.rules ?? {}),
    usgs_site_id: sqlLiteral(p.usgs_site_id),
    river_gauge_site_id: sqlLiteral(p.river_gauge_site_id),
    gauge_distance_km: sqlLiteral(p.gauge_distance_km),
    nws_grid: sqlJsonb(p.nws_grid),
    nws_zone: sqlLiteral(p.nws_zone),
    nws_county: sqlLiteral(p.nws_county),
    typical_closure_time: sqlLiteral(p.typical_closure_time),
    cavern_warning: sqlLiteral(p.cavern_warning),
    safety_notes: sqlLiteral(p.safety_notes),
    official_url: sqlLiteral(p.official_url),
    photo_url: sqlLiteral(p.photo_url),
    photo_author: sqlLiteral(p.photo_author ?? null),
    photo_license: sqlLiteral(p.photo_license ?? null),
    photo_source_url: sqlLiteral(p.photo_source_url ?? null),
    entrance_notes: sqlLiteral(p.entrance_notes),
    swim_season: sqlJsonb(p.swim_season),
    description: sqlLiteral(p.description),
    water_body: sqlLiteral(p.water_body ?? null),
    city: sqlLiteral(p.city ?? null),
  };
  return PARK_COLUMNS.map((c) => v[c]).join(",\n    ");
}

function parksUpsert(parks: ParkSeed[], label: string): string[] {
  if (parks.length === 0) return [`-- (no ${label} parks)`];
  const cols = PARK_COLUMNS.map(ident).join(", ");
  const updates = PARK_COLUMNS.filter((c) => c !== "slug")
    .map((c) => `${ident(c)} = excluded.${ident(c)}`)
    .join(",\n    ");
  return parks.map(
    (p) =>
      `-- ${p.name}\ninsert into public.parks (${cols})\nvalues (\n    ${parkValues(p)}\n)\non conflict ("slug") do update set\n    ${updates},\n    "updated_at" = now();`,
  );
}

export interface BuildOptions {
  /** Used only for the header comment; defaults to new Date(). */
  now?: Date;
}

export function buildSeedSql(data: SeedData, opts: BuildOptions = {}): string {
  const now = opts.now ?? new Date();
  const accessibilitySlugs = data.parks.map((p) => p.slug).filter((s) => Boolean(data.accessibility[s]));

  const out: string[] = [];
  out.push(
    "-- =============================================================================",
    "-- LakeLens seed: GENERATED by scripts/build-seed.ts; do not edit by hand.",
    `-- Generated at ${now.toISOString()} from data/*.json.`,
    `-- Parks: ${data.deepParks.length} deep + ${data.extraParks.length} extra + ${data.basicParks.length} basic = ${data.parks.length}` +
      ` (deduped by slug, precedence deep > extra > basic);` +
      ` accessibility ${accessibilitySlugs.length}; parking lots ${data.lots.length};` +
      ` manual alerts ${data.alerts.length}; sample reports ${data.sampleReports.length}; sample reviews ${data.sampleReviews.length};` +
      ` holidays ${data.holidays?.holidays.length ?? 0}; long weekends ${data.holidays?.long_weekends.length ?? 0};` +
      ` gauge rows ${Object.keys(data.gauges).length}.`,
    "-- Idempotent: safe to re-run (parks upsert on slug; child rows for the seeded",
    "-- parks are replaced; sample reports are refreshed to now() - N minutes).",
    "-- Never touches NWS alerts (source='nws'), OSM lots (source='osm') or real reports.",
    "-- Apply with the Supabase MCP execute_sql / SQL editor (secret key) or psql -f.",
    "-- =============================================================================",
    "",
  );
  for (const w of data.warnings) out.push(`-- note: ${w}`);
  if (data.warnings.length) out.push("");

  // 1. parks ----------------------------------------------------------------
  out.push("-- ---------------------------------------------------------------- parks (deep tier)");
  out.push(...parksUpsert(data.deepParks, "deep"), "");
  out.push("-- ---------------------------------------------------------------- parks (extra tier)");
  out.push(...parksUpsert(data.extraParks, "extra"), "");
  out.push("-- ---------------------------------------------------------------- parks (basic tier)");
  out.push(...parksUpsert(data.basicParks, "basic"), "");

  // 2. accessibility ---------------------------------------------------------
  out.push("-- ---------------------------------------------------------------- accessibility");
  if (accessibilitySlugs.length) {
    out.push(
      `delete from public.accessibility where park_id in (select id from public.parks where slug in (${accessibilitySlugs.map(sqlString).join(", ")}));`,
    );
  }
  for (const s of accessibilitySlugs) {
    const a = data.accessibility[s];
    out.push(
      `insert into public.accessibility ("park_id", "water_access", "entry_type", "ada_parking", "parking_to_water_m", "accessible_restroom", "surface", "wheelchair_loaner", "handrails", "shade", "depth_at_entry_note", "service_animals_note", "verified", "source")`,
      `values (${parkIdBySlug(s)}, ${sqlLiteral(a.water_access)}, ${sqlLiteral(a.entry_type)}, ${sqlLiteral(a.ada_parking)}, ${sqlLiteral(a.parking_to_water_m)}, ${sqlLiteral(a.accessible_restroom)}, ${sqlLiteral(a.surface)}, ${sqlLiteral(a.wheelchair_loaner)}, ${sqlLiteral(a.handrails)}, ${sqlLiteral(a.shade)}, ${sqlLiteral(a.depth_at_entry_note)}, ${sqlLiteral(a.service_animals_note)}, ${sqlLiteral(a.verified)}, ${sqlLiteral(a.source)});`,
    );
  }
  out.push("");

  // 3. parking lots ----------------------------------------------------------
  out.push("-- ---------------------------------------------------------------- parking_lots (curated)");
  const lotSlugs = [...new Set(data.lots.map((l) => l.park_slug))];
  if (lotSlugs.length) {
    out.push(
      `delete from public.parking_lots where source = 'curated' and park_id in (select id from public.parks where slug in (${lotSlugs.map(sqlString).join(", ")}));`,
    );
  }
  for (const l of data.lots) {
    out.push(
      `insert into public.parking_lots ("park_id", "name", "lat", "lng", "fee", "capacity", "ada_spaces", "is_overflow", "source", "notes")`,
      `values (${parkIdBySlug(l.park_slug)}, ${sqlLiteral(l.name)}, ${sqlLiteral(l.lat)}, ${sqlLiteral(l.lng)}, ${sqlLiteral(l.fee)}, ${sqlLiteral(l.capacity)}, ${sqlLiteral(l.ada_spaces)}, ${sqlLiteral(l.is_overflow)}, ${sqlLiteral(l.source)}, ${sqlLiteral(l.notes)});`,
    );
  }
  out.push("");

  // 4. manual alerts ---------------------------------------------------------
  out.push("-- ---------------------------------------------------------------- park_alerts (manual)");
  const alertSlugs = [...new Set(data.alerts.map((a) => a.park_slug))];
  if (alertSlugs.length) {
    out.push(
      `delete from public.park_alerts where source = 'manual' and park_id in (select id from public.parks where slug in (${alertSlugs.map(sqlString).join(", ")}));`,
    );
  }
  for (const a of data.alerts) {
    out.push(
      `insert into public.park_alerts ("park_id", "kind", "text", "source", "official_url", "severity", "starts_at", "ends_at", "hash", "first_seen", "last_seen", "active", "last_checked_at")`,
      `values (${parkIdBySlug(a.park_slug)}, ${sqlLiteral(a.kind)}, ${sqlLiteral(a.text.trim())}, ${sqlLiteral(a.source)}, ${sqlLiteral(a.official_url)}, ${sqlLiteral(a.severity)}, ${sqlLiteral(a.starts_at)}${a.starts_at ? "::timestamptz" : ""}, ${sqlLiteral(a.ends_at)}${a.ends_at ? "::timestamptz" : ""}, ${sqlLiteral(alertHash(a))}, now(), now(), ${sqlLiteral(a.active)}, now())`,
      `on conflict ("hash") do update set "text" = excluded."text", "official_url" = excluded."official_url", "severity" = excluded."severity", "starts_at" = excluded."starts_at", "ends_at" = excluded."ends_at", "active" = excluded."active", "last_seen" = now(), "last_checked_at" = now();`,
    );
  }
  out.push("");

  // 5. sample reports --------------------------------------------------------
  out.push("-- ---------------------------------------------------------------- reports (is_sample = true)");
  out.push("delete from public.reports where is_sample = true;");
  data.sampleReports.forEach((r, i) => {
    out.push(
      `insert into public.reports ("park_id", "category", "value", "note", "photo_url", "device_id", "is_sample", "created_at")`,
      `values (${parkIdBySlug(r.park_slug)}, ${sqlLiteral(r.category)}, ${sqlLiteral(r.value)}, ${sqlLiteral(r.note ?? null)}, null, ${sqlLiteral(sampleDeviceId(`${r.park_slug}#${i}`))}::uuid, true, now() - interval '${r.minutes_ago} minutes');`,
    );
  });
  out.push("");

  // 6. holidays --------------------------------------------------------------
  out.push("-- ---------------------------------------------------------------- holidays / long_weekends");
  if (data.holidays) {
    for (const h of data.holidays.holidays) {
      out.push(
        `insert into public.holidays ("date", "name") values (${sqlLiteral(h.date)}, ${sqlLiteral(h.name)}) on conflict ("date") do update set "name" = excluded."name";`,
      );
    }
    for (const w of data.holidays.long_weekends) {
      out.push(
        `insert into public.long_weekends ("start_date", "end_date") values (${sqlLiteral(w.start_date)}, ${sqlLiteral(w.end_date)}) on conflict ("start_date") do update set "end_date" = excluded."end_date";`,
      );
    }
  } else {
    out.push("-- (no holidays file, skipped)");
  }
  out.push("");

  // 7. calendar events ------------------------------------------------------
  // These drive the closure score (UF home games, spring break, summer). They used to be
  // bundled into the app from data/events.json; now the DB is what the app reads, and
  // this file is only the seed source.
  out.push("-- ---------------------------------------------------------------- calendar_events");
  for (const e of data.events) {
    out.push(
      `insert into public.calendar_events ("name", "start_date", "end_date", "weight", "source")`,
      `values (${sqlLiteral(e.name)}, ${sqlLiteral(e.start)}, ${sqlLiteral(e.end)}, ${e.weight ?? 1}, 'data/events.json')`,
      `on conflict ("name", "start_date") do update set "end_date" = excluded."end_date", "weight" = excluded."weight", "source" = excluded."source";`,
    );
  }
  out.push("");
  // 8. sample reviews --------------------------------------------------------
  // Seeded demo rows. is_sample = true is what makes the UI badge them and note that the
  // score includes sample data; the client can never set that flag.
  out.push("-- ---------------------------------------------------------------- reviews (is_sample = true)");
  out.push("delete from public.reviews where is_sample = true;");
  data.sampleReviews.forEach((r, i) => {
    out.push(
      `insert into public.reviews ("park_id", "rating", "body", "device_id", "is_sample", "created_at")`,
      `values (${parkIdBySlug(r.park_slug)}, ${r.rating}, ${sqlLiteral(r.body ?? null)}, ${sqlLiteral(sampleDeviceId(`review#${r.park_slug}#${i}`))}::uuid, true, now() - interval '${r.days_ago} days');`,
    );
  });
  out.push("");

  out.push("-- end of seed", "");
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
export function main(argv: string[] = process.argv.slice(2)): number {
  const check = argv.includes("--check");
  const skipBasic = argv.includes("--skip-basic");
  const skipExtra = argv.includes("--skip-extra");
  const outIdx = argv.indexOf("--out");
  const outPath = resolve(REPO_ROOT, outIdx >= 0 && argv[outIdx + 1] ? argv[outIdx + 1] : "supabase/seed.sql");

  let data: SeedData;
  try {
    data = loadSeedData(REPO_ROOT, { skipBasic, skipExtra });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
  const problems = validateReferences(data);
  if (problems.length) {
    console.error(`Seed data has ${problems.length} cross-reference problem(s):\n  - ${problems.join("\n  - ")}`);
    return 1;
  }
  for (const w of data.warnings) console.warn(`note: ${w}`);

  const sql = buildSeedSql(data);
  if (check) {
    console.log(`OK: seed data valid (${sql.length} bytes of SQL would be written to ${outPath})`);
    return 0;
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, sql, "utf8");
  console.log(
    `Wrote ${outPath} (${sql.length} bytes): ${data.deepParks.length} deep + ${data.extraParks.length} extra + ${data.basicParks.length} basic parks (${data.parks.length} total), ` +
      `${Object.keys(data.accessibility).length} accessibility, ${data.lots.length} lots, ${data.alerts.length} alerts, ${data.sampleReports.length} sample reports, ` +
      `${data.holidays?.holidays.length ?? 0} holidays.`,
  );
  return 0;
}

const isDirectRun = (() => {
  try {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
  } catch {
    return false;
  }
})();

if (isDirectRun) process.exitCode = main();
