/**
 * Shared helpers for the DATA-basic fetch scripts (scripts/fetch-*.ts).
 *
 * Run any script with:  node --experimental-strip-types scripts/<name>.ts [--refresh]
 *
 * Every script is idempotent: raw upstream responses are cached under
 * data/osm-cache/ and re-used on the next run unless --refresh is passed.
 * Pure Node (no Next/React); type-only imports are erased at runtime.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = join(ROOT, "data");
export const CACHE_DIR = join(DATA_DIR, "osm-cache");

/** Identifies LakeLens to NWS / Overpass / Nager (NWS returns 403 without a UA). */
export const USER_AGENT = "LakeLens/0.1 (https://lakelens.vercel.app; kenzof28@gmail.com)";

export const REFRESH = process.argv.includes("--refresh");

/** The 7 deep-tier parks (owned by DATA-deep in data/parks.deep.json); coords are swim-area points. */
export const DEEP_PARKS: ReadonlyArray<{ slug: string; name: string; lat: number; lng: number }> = [
  { slug: "ichetucknee-springs-state-park", name: "Ichetucknee Springs State Park", lat: 29.98389, lng: -82.76194 },
  { slug: "ginnie-springs", name: "Ginnie Springs", lat: 29.83608, lng: -82.70015 },
  { slug: "poe-springs-park", name: "Poe Springs Park", lat: 29.82583, lng: -82.64928 },
  { slug: "gilchrist-blue-springs-state-park", name: "Ruth B. Kirby Gilchrist Blue Springs State Park", lat: 29.82972, lng: -82.6829 },
  { slug: "rainbow-springs-state-park", name: "Rainbow Springs State Park", lat: 29.1025, lng: -82.4375 },
  { slug: "blue-spring-state-park", name: "Blue Spring State Park", lat: 28.94722, lng: -81.33972 },
  { slug: "wekiwa-springs-state-park", name: "Wekiwa Springs State Park", lat: 28.7117, lng: -81.4603 },
];

export const DEEP_SLUGS: ReadonlySet<string> = new Set(DEEP_PARKS.map((p) => p.slug));

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (err) {
    console.warn(`[fetch-lib] could not parse ${path}: ${(err as Error).message}`);
    return null;
  }
}

export function writeJson(path: string, data: unknown): void {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** kebab-case of a name: "Ruth B. Kirby Gilchrist Blue Springs State Park" -> "ruth-b-kirby-gilchrist-blue-springs-state-park" */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’.]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Loose key for joining names across sources: drops punctuation, "state park", "the", and common stop words. */
export function normalizeParkKey(nameOrSlug: string): string {
  return slugify(nameOrSlug)
    .replace(/-(state|park|parks|recreation|area|preserve|reserve|trail|historic|site|the|and|of)(?=-|$)/g, "")
    .replace(/^(the|and|of)-/, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export interface CachedFetchResult<T> {
  data: T;
  fromCache: boolean;
  cachePath: string;
}

/**
 * GET/POST JSON with a small retry, caching the raw body under data/osm-cache/<cacheName>.
 * Cache is used when present unless --refresh is passed. Follows redirects (fetch default).
 */
export async function cachedFetchJson<T>(
  cacheName: string,
  url: string,
  init: RequestInit = {},
  opts: { refresh?: boolean; retries?: number; retryDelayMs?: number; /** write the raw body to the cache (default true) */ persist?: boolean } = {},
): Promise<CachedFetchResult<T>> {
  const cachePath = join(CACHE_DIR, cacheName);
  const refresh = opts.refresh ?? REFRESH;
  if (!refresh) {
    const cached = readJson<T>(cachePath);
    if (cached !== null) return { data: cached, fromCache: true, cachePath };
  }
  const retries = opts.retries ?? 2;
  const retryDelayMs = opts.retryDelayMs ?? 3000;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const headers = new Headers(init.headers ?? {});
      if (!headers.has("User-Agent")) headers.set("User-Agent", USER_AGENT);
      if (!headers.has("Accept")) headers.set("Accept", "application/json");
      const res = await fetch(url, { ...init, headers, redirect: "follow" });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 300);
        throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}: ${body}`);
      }
      const data = (await res.json()) as T;
      if (opts.persist !== false) writeJson(cachePath, data);
      return { data, fromCache: false, cachePath };
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        console.warn(`[fetch-lib] ${url} failed (attempt ${attempt + 1}/${retries + 1}): ${(err as Error).message}; retrying in ${retryDelayMs} ms`);
        await sleep(retryDelayMs);
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}
