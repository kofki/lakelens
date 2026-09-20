/**
 * What this browser remembers about the person using it: saved parks, and the last few
 * they looked at.
 *
 * Deliberately local. Both of these are useful the first time someone taps them, and
 * neither is worth a sign-in prompt. Once anonymous auth is enabled on the project this
 * becomes the cache in front of a synced copy, which is why the read and write paths are
 * already behind functions rather than inlined `localStorage` calls.
 *
 * Every access is wrapped: a private window, blocked site data, or a preview frame all
 * make storage throw, and a page that will not render because it could not read a list of
 * favourites is a far worse bug than a forgotten favourite.
 */
export const FAVORITES_KEY = "lakelens.favorites.v1";
export const RECENTS_KEY = "lakelens.recents.v1";

/** Enough to say "because you looked at X" without becoming a browsing history. */
export const MAX_RECENTS = 8;

type Store = Pick<Storage, "getItem" | "setItem">;

function read(storage: Store | null | undefined, key: string): string[] {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Anything that is not a non-empty string is not a slug, whoever wrote it.
    return parsed.filter((v): v is string => typeof v === "string" && v.length > 0);
  } catch {
    return [];
  }
}

function write(storage: Store | null | undefined, key: string, values: string[]): void {
  try {
    storage?.setItem(key, JSON.stringify(values));
  } catch {
    // Nothing to do. The list is a convenience, not a record.
  }
}

export function readFavorites(storage: Store | null | undefined): string[] {
  return read(storage, FAVORITES_KEY);
}

/** Toggling returns the new list, so a caller never has to re-read to know the result. */
export function toggleFavorite(storage: Store | null | undefined, slug: string): string[] {
  const current = readFavorites(storage);
  const next = current.includes(slug) ? current.filter((s) => s !== slug) : [slug, ...current];
  write(storage, FAVORITES_KEY, next);
  return next;
}

export function readRecents(storage: Store | null | undefined): string[] {
  return read(storage, RECENTS_KEY).slice(0, MAX_RECENTS);
}

/**
 * Record a visit.
 *
 * Most recent first, no duplicates, capped. Revisiting a park moves it to the front rather
 * than adding a second entry, so "because you looked at X" names the last distinct places
 * rather than the same one eight times.
 */
export function recordVisit(storage: Store | null | undefined, slug: string): string[] {
  if (!slug) return readRecents(storage);
  const next = [slug, ...readRecents(storage).filter((s) => s !== slug)].slice(0, MAX_RECENTS);
  write(storage, RECENTS_KEY, next);
  return next;
}

/**
 * The two lists as external stores, so components read them through
 * `useSyncExternalStore` rather than a state update in an effect, and the server renders
 * the empty case without a hydration mismatch.
 */
const listeners = new Set<() => void>();
let favoritesCache: string[] | undefined;
let recentsCache: string[] | undefined;

const EMPTY: string[] = [];

function browserStorage(): Store | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribePersonal(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Cached: getSnapshot must return a stable reference or React re-renders forever. */
export function getFavorites(): string[] {
  favoritesCache ??= readFavorites(browserStorage());
  return favoritesCache;
}

export function getRecents(): string[] {
  recentsCache ??= readRecents(browserStorage());
  return recentsCache;
}

/** The server knows nothing about this browser, so it renders the empty case. */
export function getPersonalServer(): string[] {
  return EMPTY;
}

export function toggleFavoriteSlug(slug: string): void {
  favoritesCache = toggleFavorite(browserStorage(), slug);
  notify();
}

export function recordVisitSlug(slug: string): void {
  recentsCache = recordVisit(browserStorage(), slug);
  notify();
}
