/**
 * FROZEN SHARED CONTRACT for LakeLens.
 * Every work package builds against these types. Only the INFRA owner edits this file.
 * Keep it free of React / Next / map imports so pure lib code and vitest can use it.
 *
 * Column names mirror the Postgres schema (snake_case) so rows can be passed through
 * from Supabase without mapping. Generated `lib/database.types.ts` is the source of
 * truth for DB shapes once created; these interfaces are the app-level view.
 */
import type { AmenityKind, ParkAmenities } from "../supabase/functions/_shared/amenities";

export type { AmenityKind, ParkAmenities };

// ---------- enums (mirrored as CHECK constraints in SQL) ----------
/**
 * A park is only `full`/`closed` once it has actually stopped letting people in.
 * A park that is expected to fill later today stays `open`; the forecast lives in
 * ParkStatus.predictedTime + reasons so the UI can say "Open · usually fills by 10:15".
 */
export type StatusLevel = "open" | "full" | "closed" | "unknown";
export type CoverageTier = "basic" | "deep";
export type ParkType = "spring" | "lake" | "river";
export type Operator = "state" | "county" | "private";
export type Guarded = "yes" | "no" | "unknown";
export type WaterAccess = "yes" | "limited" | "no" | "unknown";
export type EntryType = "ramp" | "stairs" | "dock_ladder" | "sloped_bank" | "sand" | "other" | "unknown";
export type Surface = "paved" | "boardwalk" | "sand" | "natural" | "unknown";
export type AlertKind = "closure" | "notice" | "nws";
/** Weather is NWS only (no second provider); water is USGS inland, NOAA on the coast. */
export type ConditionsSource = "usgs" | "noaa" | "nws";
export type ReportCategory = "entry" | "conditions" | "parking" | "accessibility";

export const REPORT_VALUES = {
  entry: ["got_in", "turned_away", "line"],
  conditions: ["crowded", "water_high", "water_murky", "gator", "launch_closed"],
  parking: ["lot_full", "overflow_open"],
  accessibility: ["ramp_blocked", "wheelchair_available", "restroom_closed"],
} as const satisfies Record<ReportCategory, readonly string[]>;

export type ReportValue = (typeof REPORT_VALUES)[ReportCategory][number];

/** Plain-language labels for one-tap report buttons and report cards. */
export const REPORT_VALUE_LABELS: Record<ReportValue, string> = {
  got_in: "Got in",
  turned_away: "Turned away",
  line: "Line at gate",
  crowded: "Crowded",
  water_high: "Water high",
  water_murky: "Water murky",
  gator: "Gator sighting",
  launch_closed: "Launch closed",
  lot_full: "Lot full",
  overflow_open: "Overflow lot open",
  ramp_blocked: "Ramp blocked",
  wheelchair_available: "Wheelchair available",
  restroom_closed: "Accessible restroom closed",
};

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  entry: "Entry",
  conditions: "Conditions",
  parking: "Parking",
  accessibility: "Accessibility",
};

// ---------- database rows ----------
export interface ParkRules {
  alcohol?: string;
  tubing?: string;
  pets?: string;
  life_jackets?: string;
  other?: string[];
}

export interface SwimSeason {
  /** "MM-DD" inclusive open date, e.g. "04-01" */
  open: string;
  /** "MM-DD" inclusive close date, e.g. "11-14" */
  close: string;
  note?: string;
}

export interface NwsGrid {
  gridId: string;
  gridX: number;
  gridY: number;
  forecast: string;
  forecastHourly: string;
}

export interface Park {
  id: string;
  slug: string;
  name: string;
  type: ParkType;
  operator: Operator;
  lat: number;
  lng: number;
  coverage_tier: CoverageTier;
  swimming_verified: boolean;
  guarded: Guarded;
  hours: string | null;
  fees: string | null;
  reservation_required: boolean;
  reservation_url: string | null;
  rules: ParkRules;
  usgs_site_id: string | null;
  river_gauge_site_id: string | null;
  gauge_distance_km: number | null;
  /**
   * NOAA CO-OPS (Tides & Currents) station for coastal parks with no USGS gauge.
   * Optional so park fixtures and seed builders written before migration
   * 20260919020000 still typecheck; queries.ts always reads it from the DB row.
   */
  noaa_station_id?: string | null;
  noaa_distance_km?: number | null;
  nws_grid: NwsGrid | null;
  nws_zone: string | null;
  /** IANA zone from the NWS points response, e.g. "America/New_York". Null falls back to Eastern. */
  time_zone?: string | null;
  /** Two-letter USPS code, e.g. "FL". Optional so fixtures predating the column still typecheck. */
  state?: string | null;
  /** OSM amenity counts. An absent kind means unmapped, NOT absent on the ground. */
  amenities?: ParkAmenities | null;
  nws_county: string | null;
  /** "HH:MM" local time the park typically fills on weekends/holidays, or null */
  typical_closure_time: string | null;
  cavern_warning: boolean;
  safety_notes: string | null;
  official_url: string | null;
  photo_url: string | null;
  entrance_notes: string | null;
  swim_season: SwimSeason | null;
  description: string | null;
  updated_at: string;
}

export interface Accessibility {
  park_id: string;
  water_access: WaterAccess;
  entry_type: EntryType;
  ada_parking: boolean | null;
  parking_to_water_m: number | null;
  accessible_restroom: boolean | null;
  surface: Surface;
  wheelchair_loaner: boolean | null;
  handrails: boolean | null;
  shade: boolean | null;
  depth_at_entry_note: string | null;
  service_animals_note: string | null;
  verified: boolean;
  source: string | null;
  updated_at: string;
}

export interface ParkingLot {
  id: string;
  park_id: string;
  name: string;
  lat: number;
  lng: number;
  fee: string | null;
  capacity: number | null;
  ada_spaces: number | null;
  is_overflow: boolean;
  source: "osm" | "curated";
  notes: string | null;
}

export interface ParkAlert {
  id: string;
  park_id: string;
  kind: AlertKind;
  text: string;
  /** "manual", "nws", ... */
  source: string;
  official_url: string | null;
  severity: string | null;
  starts_at: string | null;
  ends_at: string | null;
  hash: string;
  first_seen: string;
  last_seen: string;
  active: boolean;
  last_checked_at: string | null;
}

export interface ConditionsSnapshot<P = unknown> {
  id: string;
  park_id: string;
  source: ConditionsSource;
  payload: P;
  fetched_at: string;
}

export interface Report {
  id: string;
  park_id: string;
  category: ReportCategory;
  value: ReportValue;
  note: string | null;
  photo_url: string | null;
  device_id: string;
  is_sample: boolean;
  created_at: string;
}

export interface ReportConfirmation {
  id: string;
  report_id: string;
  device_id: string;
  response: "still_true" | "no_longer";
  created_at: string;
}

export interface Holiday {
  date: string; // YYYY-MM-DD (observed date)
  name: string;
}

export interface LongWeekend {
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
}

export interface CalendarEvent {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD inclusive
  name: string;
  /** crowd weight added to the prediction score, default 1 */
  weight?: number;
}

// ---------- ingest payloads (stored in conditions_snapshots.payload) ----------
// Defined in supabase/functions/_shared/types.ts so the Edge Function and the app agree.
import type {
  UsgsParameter,
  UsgsReading,
  UsgsPayload,
  NoaaParameter,
  NoaaReading,
  NoaaTide,
  NoaaPayload,
  WeatherHour,
  WeatherDay,
  WeatherPayload,
  ParkLike,
  HourlyColumnar,
  ForecastDay,
  SourceStamp,
  WaterQuality,
  WaterQualityLevel,
  ParkForecastRow,
} from "../supabase/functions/_shared/types";

// Re-exported so every import site keeps using "@/lib/types".
export type {
  UsgsParameter,
  UsgsReading,
  UsgsPayload,
  NoaaParameter,
  NoaaReading,
  NoaaTide,
  NoaaPayload,
  WeatherHour,
  WeatherDay,
  WeatherPayload,
  ParkLike,
  HourlyColumnar,
  ForecastDay,
  SourceStamp,
  WaterQuality,
  WaterQualityLevel,
  ParkForecastRow,
};


/**
 * The park_forecast row as the app reads it.
 *
 * Deliberately not the raw DB row: `hourly` and `daily` are dropped for list and map
 * surfaces, so both are optional here and only the park page can rely on them.
 */
export interface ParkForecast {
  forecastAt: string;
  nowTempF: number | null;
  nowFeelsLikeF: number | null;
  nowUv: number | null;
  nowHumidity: number | null;
  nowWindMph: number | null;
  nowThunderProb: number | null;
  nowShortForecast: string | null;
  uvPeak: number | null;
  uvPeakHour: number | null;
  hourly?: HourlyColumnar | null;
  daily?: ForecastDay[];
  waterQuality: WaterQuality | null;
  sources: Record<string, SourceStamp>;
}

// ---------- amenities ----------
// Defined in supabase/functions/_shared/amenities.ts so the Edge Function and the app agree.

// ---------- reviews ----------

/**
 * A visitor review. Unlike a report this does not expire: it answers "was it worth the
 * drive", not "what is happening right now".
 */
export interface Review {
  id: string;
  park_id: string;
  /** 1 to 5, whole stars. */
  rating: number;
  body: string | null;
  photo_urls: string[];
  visited_on: string | null;
  device_id: string;
  is_sample: boolean;
  created_at: string;
}

/** Aggregate from public.park_review_stats. */
export interface ReviewStats {
  reviewCount: number;
  /** Mean rating to one decimal place, or null when there are no reviews. */
  averageRating: number | null;
  /** How many of the reviews are seeded demo rows; the UI must say when this is above 0. */
  sampleCount: number;
  /** Ratings 1 to 5, index 0 = one star. */
  distribution: [number, number, number, number, number];
}

export interface SubmitReviewInput {
  park_id: string;
  rating: number;
  body?: string | null;
  photo_urls?: string[];
  visited_on?: string | null;
  device_id: string;
}

export const REVIEW_MAX_PHOTOS = 4;
export const REVIEW_BODY_MAX = 1000;

// ---------- derived / computed ----------
export interface DayContext {
  date: string; // YYYY-MM-DD local
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  isHolidayWeekend: boolean;
  events: string[];
  eventWeight: number;
}

export type PredictionLevel = "none" | "possible" | "likely" | "closed";

export interface Prediction {
  level: PredictionLevel;
  /** ISO timestamp of the predicted fill time, or null if no closure expected */
  predictedTime: string | null;
  /** Human label, e.g. "around 10:15 AM" */
  predictedTimeLabel: string | null;
  confidence: "low" | "medium" | "high";
  score: number;
  reasons: string[];
  isEstimate: true;
}

export type ReportSignal = "none" | "reported" | "confirmed";

export interface ReportSummary {
  signal: ReportSignal;
  category: ReportCategory | null;
  value: ReportValue | null;
  /** matching reports inside the 2 h window */
  count: number;
  /** "still_true" confirmations on those reports */
  confirmations: number;
  freshestAt: string | null;
  /** a contradicting report (e.g. got_in after turned_away) exists */
  contradicted: boolean;
  confidence: "low" | "medium" | "high";
  /** what this signal implies for the park status, if anything */
  impliesLevel: StatusLevel | null;
  /** number of sample (seeded) reports included, for labelling */
  sampleCount: number;
}

export type StatusSource =
  | "alert"
  | "seasonal"
  | "hours"
  | "confirmed_reports"
  | "report_prediction"
  | "prediction"
  | "unknown";

export interface ParkStatus {
  level: StatusLevel;
  source: StatusSource;
  confidence: "low" | "medium" | "high";
  /** plain-language evidence shown in the UI, in priority order */
  reasons: string[];
  updatedAt: string | null;
  isEstimate: boolean;
  predictedTime: string | null;
}

export interface Filters {
  accessibleEntry: boolean;
  guardedOnly: boolean;
}

export const DEFAULT_FILTERS: Filters = { accessibleEntry: false, guardedOnly: false };

export interface ParkWithStatus {
  park: Park;
  status: ParkStatus;
  prediction: Prediction | null;
  accessibility: Accessibility | null;
  usgs: UsgsPayload | null;
  usgsFetchedAt: string | null;
  /** Optional for the same reason as Park.noaa_station_id; queries.ts always sets both. */
  noaa?: NoaaPayload | null;
  noaaFetchedAt?: string | null;
  weather: WeatherPayload | null;
  weatherFetchedAt: string | null;
  /** park_forecast row: UV, feels-like, thunder and water quality. Optional like noaa. */
  forecast?: ParkForecast | null;
  /** Aggregate review score. Present on every surface; the full reviews only on the park page. */
  reviewStats?: ReviewStats | null;
  alerts: ParkAlert[];
  reportSummary: ReportSummary;
  distanceKm: number | null;
}

export interface ParkBundle extends ParkWithStatus {
  parkingLots: ParkingLot[];
  reports: Report[];
  confirmations: ReportConfirmation[];
  backups: BackupSuggestion[];
  reviews: Review[];
}

export interface BackupSuggestion {
  park: Park;
  status: ParkStatus;
  accessibility: Accessibility | null;
  distanceKm: number;
  driveMinutes: number;
  parkingSummary: string | null;
}

// ---------- API payloads ----------
export interface SubmitReportInput {
  park_id: string;
  category: ReportCategory;
  value: ReportValue;
  note?: string | null;
  photo_url?: string | null;
  device_id: string;
}

export interface ConfirmReportInput {
  type: "confirmation";
  report_id: string;
  device_id: string;
  response: "still_true" | "no_longer";
}

// CronJob lives in supabase/functions/_shared/types.ts (shared with the Edge Function).
export type { CronJob } from "../supabase/functions/_shared/types";
