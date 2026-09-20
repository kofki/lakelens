/**
 * Build data/parks.basic.json: the "basic" coverage tier: every Florida State Park that lists
 * Swimming as an experience (69 on floridastateparks.org), minus the deep-tier parks that
 * DATA-deep curates in data/parks.deep.json.
 *
 *   node --experimental-strip-types scripts/fetch-fsp-swimming-parks.ts [--refresh]
 *
 * Inputs
 *  - data/osm-cache/fsp-swimming-listing.json  (69 cards: name, href, address, summary)
 *      floridastateparks.org sits behind Cloudflare bot management and returns 403 to every
 *      non-browser client, so this listing was captured with a real browser session on
 *      2026-09-19 (Find a Park, filter parks[0]=experiences:262, pages 0-4). With --refresh the
 *      script attempts a live fetch first and falls back to the cached capture when blocked.
 *  - data/osm-cache/fdep-parks.json  (from scripts/fetch-fdep-parks.ts; boundary centroids)
 *  - data/osm-cache/nws-points-basic.json (from scripts/fetch-nws-points.ts, optional): supplies
 *      nws_grid / nws_zone / nws_county plus provenance; falls back to the previous parks.basic.json so
 *      the pipeline is idempotent in either run order.
 *
 * Output: { parks: ParkSeed[] } where ParkSeed = Omit<Park, "id" | "updated_at"> & { sources: string[] }.
 * Coordinates are the FDEP park-boundary centroid, NOT the swim area (entrance_notes says so).
 * `type` is hand-tagged from the park name + local knowledge (the listing has no water-body attribute).
 */
import { join } from "node:path";
import type { Park, ParkType } from "../lib/types";
// Node's type-stripping needs the explicit .ts extension at runtime, but the root tsconfig (INFRA-owned)
// has no allowImportingTsExtensions, so a computed specifier keeps both tsc and `node` happy.
const { CACHE_DIR, DATA_DIR, REFRESH, USER_AGENT, log, normalizeParkKey, readJson, slugify, writeJson }: typeof import("./fetch-lib") = await import("./fetch-lib" + ".ts");

export type ParkSeed = Omit<Park, "id" | "updated_at"> & { sources: string[] };

interface ListingPark { page: number; name: string; href: string; address: string; summary: string }
interface Listing { meta: Record<string, unknown>; parks: ListingPark[] }
interface FdepPark { site_name: string; slug: string | null; name_slug: string; url: string | null; address: string | null; county: string | null; lat: number; lng: number }
interface FdepFile { parks: FdepPark[] }
interface NwsSidecar { parks: Record<string, Pick<Park, "nws_grid" | "nws_zone" | "nws_county"> & { points_url: string; probe: { lat: number; lng: number; offset_km: number; centroid_zone: string | null } | null }> }

const SITE = "https://www.floridastateparks.org";
const LISTING_URL = `${SITE}/parks-and-trails?parks%5B0%5D=experiences%3A262`;
const FDEP_LAYER = "https://ca.dep.state.fl.us/arcgis/rest/services/OpenData/PARKS_BOUNDARIES/MapServer/0";
const LISTING_CACHE = join(CACHE_DIR, "fsp-swimming-listing.json");
const FDEP_PATH = join(CACHE_DIR, "fdep-parks.json");
const NWS_SIDECAR = join(CACHE_DIR, "nws-points-basic.json");
const OUT_PATH = join(DATA_DIR, "parks.basic.json");

/** Deep-tier parks (data/parks.deep.json) are excluded here. Keyed by the site href's last segment. */
const DEEP_SITE_SLUGS = new Set([
  "ichetucknee-springs-state-park",
  "ruth-b-kirby-gilchrist-blue-springs-state-park", // deep slug: gilchrist-blue-springs-state-park
  "rainbow-springs-state-park",
  "blue-spring-state-park",
  "wekiwa-springs-state-park",
]);

/** Day-use reservation parks per the official FAQ (Wekiwa/Rainbow/Blue Spring are deep tier). */
const RESERVATION_REQUIRED = new Set(["henderson-beach-state-park"]);
const RESERVATION_URL = "https://reserve.floridastateparks.org/";

/**
 * Hand-tagged water-body type per park (keyed by kebab-case of the official name).
 * spring = spring-fed swim area; lake = freshwater lake beach; river = river swim area.
 *
 * "coastal" is not a ParkType: salt water is out of scope, so those parks are tagged here
 * only so the fetcher can recognise and SKIP them rather than silently mistyping them.
 */
type TaggedType = ParkType | "coastal";

const TYPE_BY_SLUG: Record<string, TaggedType> = {
  "alfred-b-maclay-gardens-state-park": "lake", // Lake Hall
  "anastasia-state-park": "coastal",
  "anclote-key-preserve-state-park": "coastal",
  "avalon-state-park": "coastal",
  "bahia-honda-state-park": "coastal",
  "bald-point-state-park": "coastal",
  "big-lagoon-state-park": "coastal",
  "bill-baggs-cape-florida-state-park": "coastal",
  "blackwater-river-state-park": "river",
  "caladesi-island-state-park": "coastal",
  "camp-helen-state-park": "coastal", // Gulf beach + Lake Powell dune lake
  "cayo-costa-state-park": "coastal",
  "curry-hammock-state-park": "coastal",
  "de-leon-springs-state-park": "spring",
  "deer-lake-state-park": "coastal",
  "delnor-wiggins-pass-state-park": "coastal",
  "don-pedro-island-state-park": "coastal",
  "dr-julian-g-bruce-st-george-island-state-park": "coastal",
  "dr-von-d-mizell-eula-johnson-state-park": "coastal",
  "edward-ball-wakulla-springs-state-park": "spring",
  "egmont-key-state-park": "coastal",
  "falling-waters-state-park": "lake",
  "fanning-springs-state-park": "spring",
  "florida-caverns-state-park": "spring", // Blue Hole Spring swim area
  "fort-clinch-state-park": "coastal",
  "fort-pierce-inlet-state-park": "coastal",
  "fort-zachary-taylor-historic-state-park": "coastal",
  "gamble-rogers-memorial-state-recreation-area-at-flagler-beach": "coastal",
  "gasparilla-island-state-park": "coastal",
  "grayton-beach-state-park": "coastal",
  "henderson-beach-state-park": "coastal",
  "honeymoon-island-state-park": "coastal",
  "hugh-taylor-birch-state-park": "coastal",
  "indian-key-historic-state-park": "coastal",
  "john-d-macarthur-beach-state-park": "coastal",
  "john-pennekamp-coral-reef-state-park": "coastal",
  "lafayette-blue-springs-state-park": "spring",
  "lake-louisa-state-park": "lake",
  "lake-manatee-state-park": "lake",
  "lignumvitae-key-botanical-state-park": "coastal",
  "little-talbot-island-state-park": "coastal",
  "long-key-state-park": "coastal",
  "lovers-key-state-park": "coastal",
  "madison-blue-spring-state-park": "spring",
  "manatee-springs-state-park": "spring",
  "mike-roess-gold-head-branch-state-park": "lake", // Little Lake Johnson
  "north-peninsula-state-park": "coastal",
  "oleno-state-park": "river", // Santa Fe River
  "ochlockonee-river-state-park": "river",
  "oleta-river-state-park": "coastal", // Biscayne Bay swim beach
  "oscar-scherer-state-park": "lake", // Lake Osprey
  "perdido-key-state-park": "coastal",
  "ponce-de-leon-springs-state-park": "spring",
  "san-pedro-underwater-archaeological-preserve-state-park": "coastal",
  "sebastian-inlet-state-park": "coastal",
  "st-andrews-state-park": "coastal",
  "st-lucie-inlet-preserve-state-park": "coastal",
  "stump-pass-beach-state-park": "coastal",
  "th-stone-memorial-st-joseph-peninsula-state-park": "coastal",
  "topsail-hill-preserve-state-park": "coastal",
  "troy-spring-state-park": "spring",
  "weeki-wachee-springs-state-park": "spring", // Buccaneer Bay
  "wes-skiles-peacock-springs-state-park": "spring",
  "william-j-billy-joe-rish-recreation-area": "coastal",
};

/** Manual joins where the site name and FDEP SITE_NAME differ beyond normalisation. */
const FDEP_NAME_OVERRIDES: Record<string, string> = {
  // listing slug -> FDEP site_name (exact)
};

/**
 * Fallback when a slug is missing from TYPE_BY_SLUG: infer from the name.
 *
 * Anything that does not name fresh water is assumed coastal and skipped, which is the
 * safe direction to be wrong in: a missed freshwater park can be added by hand, whereas a
 * salt-water park typed as a lake would silently re-enter a dataset that excludes it.
 */
function inferType(name: string): TaggedType {
  const n = name.toLowerCase();
  if (/spring/.test(n)) return "spring";
  if (/\blake\b/.test(n)) return "lake";
  if (/\briver\b/.test(n)) return "river";
  return "coastal";
}

function hrefSlug(href: string): string {
  const parts = href.split("/").filter(Boolean);
  return (parts[parts.length - 1] ?? "").toLowerCase();
}

function isBoatOnly(summary: string, address: string): boolean {
  const s = `${summary} ${address}`.toLowerCase();
  return /accessible only by (private )?boat|only by boat|reachable only by boat|offshore/.test(s);
}

async function loadListing(): Promise<{ listing: Listing; fromLive: boolean }> {
  const cached = readJson<Listing>(LISTING_CACHE);
  if (REFRESH) {
    // Best effort: floridastateparks.org normally answers 403 to non-browser clients.
    try {
      const res = await fetch(`${LISTING_URL}&page=0`, { headers: { "User-Agent": USER_AGENT } });
      if (res.ok) {
        console.warn("[fsp] live listing fetch succeeded (200) but this script does not parse HTML; re-capture with the browser tool if the list changed.");
      } else {
        console.warn(`[fsp] live listing fetch blocked (HTTP ${res.status}); using browser capture at ${LISTING_CACHE}`);
      }
    } catch (err) {
      console.warn(`[fsp] live listing fetch failed: ${(err as Error).message}; using browser capture`);
    }
  }
  if (!cached) throw new Error(`Missing ${LISTING_CACHE}: capture the Swimming listing with a browser session first.`);
  return { listing: cached, fromLive: false };
}

export function joinToFdep(item: ListingPark, fdep: FdepPark[]): FdepPark | null {
  const slug = slugify(item.name);
  const site = hrefSlug(item.href);
  const override = FDEP_NAME_OVERRIDES[slug];
  if (override) {
    const hit = fdep.find((f) => f.site_name === override);
    if (hit) return hit;
  }
  return (
    fdep.find((f) => f.slug === site) ??
    fdep.find((f) => f.name_slug === slug) ??
    fdep.find((f) => normalizeParkKey(f.site_name) === normalizeParkKey(item.name)) ??
    null
  );
}

async function main(): Promise<void> {
  const { listing } = await loadListing();
  const fdepFile = readJson<FdepFile>(FDEP_PATH);
  if (!fdepFile) throw new Error(`Missing ${FDEP_PATH}: run scripts/fetch-fdep-parks.ts first.`);
  const previous = readJson<{ parks: ParkSeed[] }>(OUT_PATH);
  const prevBySlug = new Map((previous?.parks ?? []).map((p) => [p.slug, p]));
  const nws = readJson<NwsSidecar>(NWS_SIDECAR)?.parks ?? {};

  log(`listing: ${listing.parks.length} parks; FDEP: ${fdepFile.parks.length} polygons; previous basic seed: ${prevBySlug.size}; NWS sidecar: ${Object.keys(nws).length}`);

  const parks: ParkSeed[] = [];
  const unmatched: string[] = [];
  const untyped: string[] = [];
  const skippedCoastal: string[] = [];
  let excluded = 0;

  for (const item of listing.parks) {
    const site = hrefSlug(item.href);
    if (DEEP_SITE_SLUGS.has(site)) {
      excluded++;
      continue;
    }
    const slug = slugify(item.name);
    const fdep = joinToFdep(item, fdepFile.parks);
    if (!fdep) {
      unmatched.push(`${item.name} (${item.href})`);
      continue;
    }
    let type = TYPE_BY_SLUG[slug];
    if (!type) {
      type = inferType(item.name);
      untyped.push(`${slug} -> ${type}`);
    }

    const officialUrl = item.href.startsWith("http") ? item.href : `${SITE}${item.href}`;
    const notes: string[] = ["Coordinates are the park centroid, not the swim area."];
    if (item.address) notes.push(`Address: ${item.address.replace(/\s+FL\s+(\d{5})$/, ", FL $1")}.`);
    if (isBoatOnly(item.summary, item.address)) notes.push("Reachable only by boat or ferry. Check the official page for access.");
    if (slug === "william-j-billy-joe-rish-recreation-area") notes.push("This park serves visitors with disabilities and their families; check the official page before visiting.");

    const prev = prevBySlug.get(slug);
    const reservationRequired = RESERVATION_REQUIRED.has(slug);
    const nwsRec = nws[slug];
    const sources = [
      `${LISTING_URL} (Swimming experience filter, captured with a browser 2026-09-19)`,
      `${FDEP_LAYER} (park boundary centroid${fdep.county ? `, ${fdep.county} County` : ""})`,
      officialUrl,
    ];
    if (nwsRec) {
      sources.push(
        nwsRec.probe
          ? `${nwsRec.points_url} (NWS forecast grid; zone/county taken from the nearest land point ${nwsRec.probe.lat},${nwsRec.probe.lng}, ~${nwsRec.probe.offset_km} km from the centroid, because the centroid is offshore)`
          : `${nwsRec.points_url} (NWS forecast grid, zone and county)`,
      );
    }

    if (type === "coastal") {
      skippedCoastal.push(slug);
      continue;
    }

    parks.push({
      slug,
      name: item.name,
      type,
      operator: "state",
      lat: fdep.lat,
      lng: fdep.lng,
      coverage_tier: "basic",
      swimming_verified: true,
      guarded: "unknown",
      hours: "8 a.m. to sundown, 365 days",
      fees: null,
      reservation_required: reservationRequired,
      reservation_url: reservationRequired ? RESERVATION_URL : null,
      rules: {},
      usgs_site_id: null,
      river_gauge_site_id: null,
      gauge_distance_km: null,
      nws_grid: nwsRec?.nws_grid ?? prev?.nws_grid ?? null,
      nws_zone: nwsRec?.nws_zone ?? prev?.nws_zone ?? null,
      nws_county: nwsRec?.nws_county ?? prev?.nws_county ?? null,
      typical_closure_time: null,
      cavern_warning: false,
      safety_notes: null,
      official_url: officialUrl,
      photo_url: null,
      entrance_notes: notes.join(" "),
      swim_season: null,
      description: null,
      sources,
    });
  }

  parks.sort((a, b) => a.name.localeCompare(b.name));

  if (unmatched.length) console.warn(`[fsp] ${unmatched.length} listing parks had no FDEP polygon match:\n  - ${unmatched.join("\n  - ")}`);
  if (untyped.length) console.warn(`[fsp] ${untyped.length} parks used inferred type (add to TYPE_BY_SLUG):\n  - ${untyped.join("\n  - ")}`);

  writeJson(OUT_PATH, {
    meta: {
      coverage_tier: "basic",
      generated_by: "scripts/fetch-fsp-swimming-parks.ts",
      generated_at: new Date().toISOString(),
      listing_source: LISTING_URL,
      listing_captured_at: listing.meta?.captured_at ?? null,
      coordinate_source: `${FDEP_LAYER} (boundary centroid, not the swim area)`,
      excluded_deep_parks: [...DEEP_SITE_SLUGS],
      note: "Basic tier: swimming listed by Florida State Parks; hours are the system default; fees/rules/accessibility not yet verified per park.",
    },
    parks,
  });
  log(`wrote ${OUT_PATH}: ${parks.length} basic parks (${excluded} deep-tier excluded, ${unmatched.length} unmatched)`);
  const byType = parks.reduce<Record<string, number>>((acc, p) => ((acc[p.type] = (acc[p.type] ?? 0) + 1), acc), {});
  log(`types: ${JSON.stringify(byType)}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
