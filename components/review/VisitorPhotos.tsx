import Image from "next/image";
import { Camera } from "lucide-react";
import type { Review } from "@/lib/types";
import { RatingStars } from "@/components/ui/RatingStars";

export interface VisitorPhotosProps {
  reviews: Review[];
}

/**
 * Photos visitors attached to their reviews, gathered into one strip.
 *
 * Inside a review a photo is evidence for that person's rating. Gathered up they are the
 * fastest honest answer to "what does it actually look like", which a single curated hero
 * shot taken on a good day in a good season cannot give. Newest first, because a picture
 * of this summer beats a better one from four years ago.
 */
export function VisitorPhotos({ reviews }: VisitorPhotosProps) {
  const photos = reviews
    .filter((r) => r.photo_urls.length > 0)
    .flatMap((r) => r.photo_urls.map((url) => ({ url, rating: r.rating, id: `${r.id}-${url}` })));

  if (photos.length === 0) return null;

  return (
    <section aria-labelledby="visitor-photos-heading" className="mt-4">
      <h2 id="visitor-photos-heading" className="flex items-center gap-1.5 text-sm font-extrabold text-mocha">
        <Camera aria-hidden="true" focusable="false" className="size-4 text-taupe" />
        Photos from visitors
        <span className="font-bold text-cocoa">({photos.length})</span>
      </h2>
      {/* A scroller rather than a grid: it keeps a park with twenty photos the same height
          as one with two, and swiping is what people already do with a row of pictures. */}
      <ul className="mt-2 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1" aria-label="Photos from visitors">
        {photos.map((p) => (
          <li key={p.id} className="relative shrink-0 snap-start">
            <Image
              src={p.url}
              alt=""
              width={320}
              height={320}
              sizes="160px"
              className="size-40 rounded-card border border-mist object-cover"
            />
            <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-white/95 px-1.5 py-0.5 shadow-card backdrop-blur">
              <RatingStars value={p.rating} size="sm" />
              <span className="sr-only">Rated {p.rating} out of 5 by the visitor who posted this photo</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
