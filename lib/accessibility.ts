/**
 * Pure helpers for turning curated accessibility prose into something a card can show.
 *
 * The underlying notes are quotations from park pages, which is right for provenance and
 * wrong for a label/value row: "Service animals are welcome in all areas of Florida State
 * Parks; systemwide policy excludes animals from swimming areas." is a paragraph where the
 * reader wants a word.
 */

export type ServiceAnimalAnswer = "yes" | "not-in-water" | "no";

const EXCLUDED_FROM_WATER =
  /(exclude|not allowed|not permitted|prohibit|no animals|no service animals)[^.]*\b(swim|water|tube|beach)/i;
const NOT_ALLOWED_AT_ALL = /service[- ]animals?[^.]*\b(are not allowed|are not permitted|are prohibited)\b(?![^.]*\b(swim|water|tube|beach)\b)/i;
const WELCOME = /service[- ]animals?[^.]*\b(welcome|allowed|permitted)\b/i;

/**
 * Three answers, in the order a disabled visitor needs them.
 *
 * "Not in the water" is its own answer rather than a footnote on "Yes": for someone who
 * relies on a service animal, whether it can follow them into the spring is the whole
 * question, and Florida State Parks says no systemwide while still welcoming them in the
 * park. Returns null when the note says nothing either way, so the row is dropped rather
 * than guessed.
 */
export function summarizeServiceAnimals(note: string | null | undefined): ServiceAnimalAnswer | null {
  const text = (note ?? "").trim();
  if (!text) return null;
  if (EXCLUDED_FROM_WATER.test(text)) return "not-in-water";
  if (NOT_ALLOWED_AT_ALL.test(text)) return "no";
  if (WELCOME.test(text)) return "yes";
  return null;
}

export const SERVICE_ANIMAL_LABEL: Record<ServiceAnimalAnswer, string> = {
  yes: "Yes",
  "not-in-water": "Yes, but not in the water",
  no: "No",
};
