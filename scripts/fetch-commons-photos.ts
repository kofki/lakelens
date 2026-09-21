/**
 * Find a hero photo for each park on Wikimedia Commons, by coordinates.
 *
 *   node --experimental-strip-types scripts/fetch-commons-photos.ts [--refresh] [--limit N]
 *
 * Writes data/photos.osm.json in the same shape as the other photo files.
 *
 * WHY COMMONS AND WHY HOTLINKED
 * -----------------------------
 * Commons has a geosearch API, no key, and its images carry machine-readable licence and
 * author metadata, which is what makes crediting them possible at all. The curated Florida
 * photos were downloaded into public/photos; 576 more would be hundreds of megabytes in
 * the repository for no benefit, so these reference the Commons thumbnail directly.
 * upload.wikimedia.org is already an allowed remote pattern, so next/image still resizes
 * them at the CDN.
 *
 * WHY THE LICENCE FILTER IS STRICT
 * --------------------------------
 * Share-alike would oblige the whole page to carry the same licence, so only public
 * domain, CC0 and plain CC BY are accepted. Anything whose licence cannot be read is
 * skipped rather than guessed: an unlicensed photo is a legal problem, and a park with no
 * photo just shows the placeholder.
 */
import { join } from "node:path";

const { CACHE_DIR, DATA_DIR, REFRESH, USER_AGENT, log, readJson, sleep, writeJson }: typeof import("./fetch-lib") =
  await import("./fetch-lib" + ".ts");

const API = "https://commons.wikimedia.org/w/api.php";
const OUT_PATH = join(DATA_DIR, "photos.osm.json");
const NOTE =
  "Hero photos found on Wikimedia Commons (scripts/fetch-commons-photos.ts): by coordinates, " +
  "and by the name of the water when nothing is near the park itself. " +
  "Public domain, CC0 and CC BY only: share-alike would oblige the whole page to carry the same licence. " +
  "`file` is a Commons thumbnail URL rather than a local path, so these are not downloaded. " +
  "Author and licence MUST be rendered wherever the photo appears.";
const SEARCH_RADIUS_M = 3000;
const CANDIDATES = 12;
const THUMB_WIDTH = 1200;
/**
 * Commons is asked several parks at a time.
 *
 * One request every 250 ms was courteous and took hours once there were 14,000 parks
 * without a photo. Wikimedia's own guidance is a concurrency limit rather than a rate: a
 * handful of parallel requests from an identified client is well within it, and it turns
 * an overnight job into minutes.
 */
const CONCURRENCY = 3;
/**
 * Between batches, not between requests.
 *
 * Eight at a time with a 60 ms gap drew 17,433 HTTP 429s in one run: Wikimedia's limit is
 * tighter than its guidance suggests for an anonymous client. Three at a time with a
 * breath between batches is still roughly ten times the old serial rate and comes back
 * clean. A request that is refused writes no cache entry, so a later run retries it.
 */
const GAP_MS = 200;

/** Licences with no share-alike obligation. Everything else is skipped. */
const ALLOWED_LICENCE = /^(cc0|cc[- ]by(?![- ]?sa)|public domain|pd[- ]|no restrictions|attribution$)/i;

/** Titles that are clearly not a photograph of the place. */
const REJECT_TITLE = /\b(map|diagram|chart|logo|seal|coat of arms|sign|signage|plaque|graph|plan|blueprint|portrait|headshot|screenshot|scan|document|letter|poster|flag)\b/i;
/** Titles that suggest the water itself, which is what a hero photo should show. */
const PREFER_TITLE = /\b(lake|beach|shore|shoreline|water|swim|bay|pond|river|spring|pier|dock|sunset|sunrise|park)\b/i;

/**
 * Park-name words that identify nothing.
 *
 * Almost every park here is a "Something Beach" or a "North Lake Park", so matching on
 * those words matches half of Commons: a photograph from the International Space Station
 * titled "View of Ohio" scored a full name match against "Aero View Beach" on the word
 * "view". Only the distinctive part of a name is evidence.
 */
const GENERIC_NAME_WORDS = new Set([
  "beach", "park", "lake", "pond", "river", "creek", "bay", "shore", "shores", "shoreline",
  "north", "south", "east", "west", "upper", "lower", "little", "big", "great", "view",
  "point", "city", "town", "county", "state", "public", "municipal", "island", "street",
  "avenue", "road", "drive", "trail", "area", "access", "landing", "swimming", "recreation",
  "memorial", "township", "village", "harbor", "harbour", "cove", "water", "waters",
]);

/**
 * Commons appends utm_* parameters to every thumbnail URL it hands back. They are
 * analytics for the API caller, not part of the image address, and they would otherwise be
 * stored in the seed and served to every visitor forever.
 */
export function stripTracking(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (key.startsWith("utm_")) u.searchParams.delete(key);
    }
    return u.toString().replace(/\?$/, "");
  } catch {
    return url;
  }
}

interface ImageInfo {
  thumburl?: string;
  descriptionurl?: string;
  width?: number;
  height?: number;
  extmetadata?: Record<string, { value?: string }>;
}

interface CommonsPage {
  title?: string;
  imageinfo?: ImageInfo[];
}

/** Same shape as data/photos.json so build-seed treats every photo file alike. */
export interface PhotoCredit {
  file: string;
  title: string;
  author: string;
  license: string;
  license_url: string | null;
  source_url: string;
}

/** Commons returns author as an HTML fragment; the licence needs a person, not markup. */
export function stripHtml(value: string | undefined): string {
  return (value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function isAllowedLicence(licence: string | undefined): boolean {
  const l = (licence ?? "").trim();
  if (!l) return false;
  if (/sa\b/i.test(l)) return false;
  return ALLOWED_LICENCE.test(l);
}

export interface CandidateScore {
  /** Does the title suggest this is a picture of THIS place, or of water at all. */
  relevance: number;
  /** Is it big enough, and recent enough, to work as a hero. Never a substitute for relevance. */
  quality: number;
}

/**
 * The year a photograph was taken, from Commons metadata.
 *
 * Both fields are free text and sometimes carry HTML, so this looks for a plausible year
 * anywhere in them rather than trying to parse a date.
 */
export function photoYear(meta: Record<string, { value?: string }> | undefined): number | null {
  const raw = meta?.DateTimeOriginal?.value ?? meta?.DateTime?.value ?? "";
  const match = stripHtml(raw).match(/\b(19|20)\d{2}\b/);
  if (!match) return null;
  const year = Number(match[0]);
  // A year in the future is a typo or a upload timestamp misread, not evidence.
  return year >= 1880 && year <= new Date().getFullYear() ? year : null;
}

/**
 * How much a photograph's age counts for or against it.
 *
 * Commons holds pictures of these places going back to 1900. A 1908 photograph of a lake
 * is a document, and putting it on a card answering "where can I swim today" is
 * misleading in a way a placeholder is not. Recent work is preferred, old work is
 * penalised, and an undated file sits in between rather than being thrown away: plenty of
 * good photographs carry no EXIF at all.
 */
export function recencyScore(year: number | null, now = new Date().getFullYear()): number {
  if (year === null) return 0;
  const age = now - year;
  if (age <= 5) return 3;
  if (age <= 12) return 2;
  if (age <= 25) return 0;
  return -3;
}

/**
 * Relevance and quality are scored separately on purpose.
 *
 * When they were one number, a large photograph of a theatre two kilometres away scored
 * the same as a small photograph of the lake, and the theatre won on pixels. Size can
 * break a tie between relevant photographs; it can never make an irrelevant one relevant.
 */
export function scoreCandidate(
  title: string,
  parkName: string,
  width: number,
  year: number | null = null,
): CandidateScore {
  if (REJECT_TITLE.test(title)) return { relevance: -1, quality: 0 };

  const lower = title.toLowerCase();
  // Short words ("the", "of", "st") and generic geography match everything, so neither is
  // evidence that this photograph is of THIS place.
  const distinctive = parkName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !GENERIC_NAME_WORDS.has(w));

  let relevance = 0;
  for (const w of distinctive) if (lower.includes(w)) relevance += 4;

  if (distinctive.length === 0) {
    // "North Beach", "City Beach", "Public Lake Access": the name is entirely generic, so
    // matching on it is impossible and refusing every one of them would leave most of the
    // country with no photograph at all. Fall back to the water itself: a picture titled
    // for a lake, taken within the search radius of a lake beach, is very probably that
    // lake. It is weaker evidence than a name match and is deliberately scored lower, so a
    // name match always wins when both exist.
    if (PREFER_TITLE.test(title)) relevance = 4;
  } else if (relevance > 0 && PREFER_TITLE.test(title)) {
    // A water word is corroboration once the name has already matched, never evidence on
    // its own for a park we CAN identify by name.
    relevance += 2;
  }

  const size = width >= 1600 ? 2 : width >= 900 ? 1 : 0;
  return { relevance, quality: size + recencyScore(year) };
}

/**
 * A photo has to name the place to earn its spot.
 *
 * Geosearch returns whatever is nearby, which at an urban lakefront means theatres and
 * pedestrian bridges. Requiring the title to carry a distinctive word from the park's own
 * name costs most of the coverage and buys all of the trust: a placeholder says nothing,
 * whereas a theatre presented as a beach is a small lie on every card.
 */
const MIN_RELEVANCE = 4;

/**
 * Commons returns audio, video and PDF files from the same searches as photographs, and
 * their thumburl is a generic file-type icon rather than a picture of anywhere. Accept only
 * the raster photo formats; SVG is excluded too, since those are diagrams and maps.
 */
export function isPhotoFile(title: string): boolean {
  return /\.(jpe?g|png|webp|tiff?)$/i.test(title.trim());
}

export function pickBest(pages: CommonsPage[], parkName: string): PhotoCredit | null {
  let best: { credit: PhotoCredit; score: number } | null = null;
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    const title = (page.title ?? "").replace(/^File:/, "");
    if (!info?.thumburl || !title) continue;
    if (!isPhotoFile(title)) continue;
    const meta = info.extmetadata ?? {};
    const licence = stripHtml(meta.LicenseShortName?.value);
    if (!isAllowedLicence(licence)) continue;
    const author = stripHtml(meta.Artist?.value);
    if (!author) continue;

    const { relevance, quality } = scoreCandidate(title, parkName, info.width ?? 0, photoYear(meta));
    if (relevance < MIN_RELEVANCE) continue;
    const score = relevance * 10 + quality;
    if (!best || score > best.score) {
      best = {
        score,
        credit: {
          file: stripTracking(info.thumburl),
          title,
          author: author.slice(0, 120),
          license: licence,
          license_url: stripHtml(meta.LicenseUrl?.value) || null,
          source_url: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(title)}`,
        },
      };
    }
  }
  return best?.credit ?? null;
}

/**
 * Photographs of a named body of water, found by name rather than by coordinates.
 *
 * Geosearch answers "what has been photographed within 3 km of this point", and at a
 * rural lake the answer is a grain elevator and a bridge. 1,722 parks named their water
 * and had no picture, which is the gap this closes: there are good photographs of Lake
 * Winnebago, they are just not standing on the one beach we have coordinates for.
 *
 * A photograph of the lake on a card for a beach on that lake is honest. It is not a
 * photograph of that beach, and the credit links to the file page where anyone can see
 * exactly what it is.
 */
/** One cache file per body of water, so a lake with forty beaches is searched once. */
function slugifyWater(water: string): string {
  return water.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "unnamed";
}

async function searchByWater(water: string): Promise<CommonsPage[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    // intitle: keeps this to files named for the water, rather than every file whose
    // description mentions it, which is what makes the name a usable signal at all.
    gsrsearch: `intitle:"${water}"`,
    gsrnamespace: "6",
    gsrlimit: String(CANDIDATES),
    prop: "imageinfo",
    iiprop: "url|extmetadata|size",
    iiurlwidth: String(THUMB_WIDTH),
  });
  const res = await fetch(`${API}?${params}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Commons HTTP ${res.status}`);
  const json = (await res.json()) as { query?: { pages?: Record<string, CommonsPage> } };
  return Object.values(json.query?.pages ?? {});
}

async function searchNear(lat: number, lng: number): Promise<CommonsPage[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "geosearch",
    ggscoord: `${lat}|${lng}`,
    ggsradius: String(SEARCH_RADIUS_M),
    ggslimit: String(CANDIDATES),
    ggsnamespace: "6",
    prop: "imageinfo",
    iiprop: "url|extmetadata|size",
    iiurlwidth: String(THUMB_WIDTH),
  });
  const res = await fetch(`${API}?${params}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Commons HTTP ${res.status}`);
  const json = (await res.json()) as { query?: { pages?: Record<string, CommonsPage> } };
  return Object.values(json.query?.pages ?? {});
}

interface ParkRow {
  slug: string;
  name: string;
  lat: number;
  lng: number;
  photo_url?: string | null;
  water_body?: string | null;
}

async function main(): Promise<void> {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;

  // Only parks with no photo yet; the curated Florida ones are better than anything a
  // proximity search would find.
  const files = ["parks.osm.json", "parks.basic.json", "parks.extra.json", "parks.deep.json"];
  const parks: ParkRow[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    for (const p of readJson<{ parks: ParkRow[] }>(join(DATA_DIR, f))?.parks ?? []) {
      if (seen.has(p.slug) || p.photo_url) continue;
      seen.add(p.slug);
      parks.push(p);
    }
  }

  // The harvest files do not carry the water body; the check that named it writes its own.
  const verdicts =
    readJson<{ verdicts: Record<string, { water_body: string | null }> }>(
      join(DATA_DIR, "water-bodies.osm.json"),
    )?.verdicts ?? {};
  for (const park of parks) park.water_body ??= verdicts[park.slug]?.water_body ?? null;
  const named = parks.filter((p) => p.water_body).length;
  log(`${parks.length} parks with no photo, ${named} of them naming their water`);

  const existing = readJson<{ photos: Record<string, PhotoCredit> }>(OUT_PATH)?.photos ?? {};
  const photos: Record<string, PhotoCredit> = { ...existing };
  let found = 0;
  let checked = 0;

  /** One park: cache lookup, then whichever searches it still needs. */
  async function handle(park: ParkRow): Promise<void> {
    const cachePath = join(CACHE_DIR, "commons", `${park.slug}.json`);
    try {
      let pages = REFRESH ? null : readJson<CommonsPage[]>(cachePath);
      if (!pages) {
        pages = await searchNear(park.lat, park.lng);
        writeJson(cachePath, pages);
      }
      let credit = pickBest(pages, park.name);

      // Nothing near the park, but we know what water it is on. There are good photographs
      // of Lake Winnebago; they are just not standing on this particular beach.
      if (!credit && park.water_body) {
        const waterCache = join(CACHE_DIR, "commons-water", `${slugifyWater(park.water_body)}.json`);
        let waterPages = REFRESH ? null : readJson<CommonsPage[]>(waterCache);
        if (!waterPages) {
          waterPages = await searchByWater(park.water_body);
          writeJson(waterCache, waterPages);
          await sleep(GAP_MS);
        }
        // Scored against the water's name, not the park's: that is what these files are
        // named for, and it is the claim being made.
        credit = pickBest(waterPages, park.water_body);
      }

      if (credit) {
        photos[park.slug] = credit;
        found++;
      }
    } catch (err) {
      console.warn(`[commons] ${park.slug}: ${(err as Error).message}`);
    }
  }

  const todo = parks.filter((park) => REFRESH || !photos[park.slug]).slice(0, limit);
  log(`${todo.length} parks to check, ${CONCURRENCY} at a time`);
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    await Promise.all(todo.slice(i, i + CONCURRENCY).map(handle));
    checked += Math.min(CONCURRENCY, todo.length - i);
    if (checked % 200 < CONCURRENCY) {
      log(`${checked}/${todo.length} checked, ${found} photos so far`);
      // Written as it goes: a run interrupted at hour two keeps what it found.
      writeJson(OUT_PATH, { _note: NOTE, generated_at: new Date().toISOString(), photos });
    }
    await sleep(GAP_MS);
  }

  writeJson(OUT_PATH, {
    _note: NOTE,
    generated_at: new Date().toISOString(),
    photos,
  });
}

// Guarded: without this, importing the module for its exported helpers runs the whole
// harvest. A unit test for one pure function started a network sweep of every state.
if (import.meta.url === `file://${process.argv[1]}`) await main();
