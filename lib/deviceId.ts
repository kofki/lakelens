/**
 * Anonymous per-browser device id used to attribute and rate-limit crowd reports.
 * Stored in localStorage under `lakelens.deviceId`; no account, no PII.
 * Safe to call during SSR (returns a throwaway id) and when storage is blocked
 * (private mode, quota, disabled cookies): every failure path returns a valid uuid.
 */

export const DEVICE_ID_STORAGE_KEY = "lakelens.deviceId";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** In-memory copy so repeated calls in one page session agree even without storage. */
let cached: string | null = null;

function randomUuid(): string {
  const c = typeof globalThis.crypto !== "undefined" ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();

  // RFC 9562 v4 layout from getRandomValues (or Math.random as a last resort).
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isValidDeviceId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Returns the persistent device id, creating one on first use.
 * Never throws; returns a fresh uuid if storage is unavailable.
 */
export function getDeviceId(): string {
  if (cached) return cached;

  let stored: string | null = null;
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      stored = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    }
  } catch {
    stored = null;
  }

  if (isValidDeviceId(stored)) {
    cached = stored;
    return stored;
  }

  const fresh = randomUuid();
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, fresh);
    }
  } catch {
    // storage blocked or full: keep the in-memory id for this session
  }
  cached = fresh;
  return fresh;
}

/** Test helper / "forget me" action: clears the stored id so the next call mints a new one. */
export function resetDeviceId(): void {
  cached = null;
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(DEVICE_ID_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}
