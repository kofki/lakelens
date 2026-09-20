/**
 * What the reader has already been asked, so we do not ask twice.
 *
 * Kept out of the component because storage is the part that throws: a private window, a
 * browser with site data blocked, or a preview frame all make localStorage unavailable, and
 * a page that cannot render because it could not read a dismissal flag is a worse bug than
 * showing the prompt one extra time.
 */
export const LOCATION_PROMPT_KEY = "lakelens.locationPrompt.v1";

export type PromptChoice = "asked" | "dismissed";

export function readPromptChoice(storage: Pick<Storage, "getItem"> | null | undefined): PromptChoice | null {
  try {
    const raw = storage?.getItem(LOCATION_PROMPT_KEY);
    return raw === "asked" || raw === "dismissed" ? raw : null;
  } catch {
    return null;
  }
}

export function writePromptChoice(storage: Pick<Storage, "setItem"> | null | undefined, choice: PromptChoice): void {
  try {
    storage?.setItem(LOCATION_PROMPT_KEY, choice);
  } catch {
    // Nothing to do: the prompt reappears next visit, which is the harmless direction.
  }
}

/**
 * Whether to offer the location prompt.
 *
 * Only on a first visit, and only while the browser has not already answered. Once the
 * reader has granted or refused, the browser's own permission is the record and asking
 * again in our own UI is noise.
 */
export function shouldOfferLocation(status: string, choice: PromptChoice | null): boolean {
  if (choice !== null) return false;
  return status === "idle";
}

/**
 * The dismissal flag as an external store, so React can read it without a state update in
 * an effect and without a hydration mismatch.
 *
 * The server has no storage, so its snapshot is "asked": the prompt is absent from the HTML
 * and appears only once the client confirms it has not been answered. That is the right way
 * round, because a prompt that flashes in and vanishes is worse than one that arrives a
 * frame late.
 */
const listeners = new Set<() => void>();
let cached: PromptChoice | null | undefined;

function storage(): Pick<Storage, "getItem" | "setItem"> | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function subscribePromptChoice(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Cached because getSnapshot must return a stable value or React re-renders forever. */
export function getPromptChoice(): PromptChoice | null {
  if (cached === undefined) cached = readPromptChoice(storage());
  return cached;
}

/** On the server nothing is known, and "asked" is what renders no prompt. */
export function getPromptChoiceServer(): PromptChoice | null {
  return "asked";
}

export function setPromptChoice(choice: PromptChoice): void {
  cached = choice;
  writePromptChoice(storage(), choice);
  for (const listener of listeners) listener();
}
