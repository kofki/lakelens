/**
 * Commons thumbnail URLs, compacted for the wire.
 *
 * A Commons thumbnail looks like
 *   https://thumb.wikimedia.org/wikipedia/commons/thumb/7/79/Name.jpg/1280px-Name.jpg
 * which is about 210 characters, of which the host and path prefix are fixed and the file
 * name appears twice. Multiplied by every park with a photo that was the largest single
 * item in the document.
 *
 * On the wire it becomes "c:7/79/Name.jpg" and the component rebuilds it. Nothing else
 * changes: the database still stores the real URL, and anything that is not a Commons
 * thumbnail is passed through untouched.
 */
const THUMB_PREFIX = "https://thumb.wikimedia.org/wikipedia/commons/thumb/";
const COMPACT_PREFIX = "c:";
/** The width the harvester asks Commons for. */
const THUMB_WIDTH = 1280;

export function compactPhotoUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!url.startsWith(THUMB_PREFIX)) return url;
  const rest = url.slice(THUMB_PREFIX.length);
  // "7/79/Name.jpg/1280px-Name.jpg" -> keep the first three segments only.
  const parts = rest.split("/");
  if (parts.length < 4) return url;
  const [a, ab, name] = parts;
  // Only compact when the trailing segment really is the derivable one, so a thumbnail at
  // a different width, or with a renamed file, survives as itself.
  if (parts[3] !== `${THUMB_WIDTH}px-${name}`) return url;
  return `${COMPACT_PREFIX}${a}/${ab}/${name}`;
}

export function expandPhotoUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith(COMPACT_PREFIX)) return value;
  const rest = value.slice(COMPACT_PREFIX.length);
  const parts = rest.split("/");
  if (parts.length !== 3) return null;
  const name = parts[2];
  return `${THUMB_PREFIX}${rest}/${THUMB_WIDTH}px-${name}`;
}
