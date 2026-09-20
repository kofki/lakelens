"use client";

import { useState } from "react";
import Image from "next/image";
import { PenLine, Star } from "lucide-react";
import type { Park, Review, ReviewStats } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { RatingStars } from "@/components/ui/RatingStars";
import { formatScore, ratingBars } from "@/lib/reviewScore";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { Section } from "@/components/ui/Section";
import { ReviewSheet } from "./ReviewSheet";

export interface ReviewsSectionProps {
  park: Park;
  reviews: Review[];
  stats: ReviewStats | null;
}

export function ReviewsSection({ park, reviews, stats }: ReviewsSectionProps) {
  const [open, setOpen] = useState(false);
  // Locally added review, so the page reflects a submission before the next revalidate.
  const [mine, setMine] = useState<Review | null>(null);
  const all = mine ? [mine, ...reviews.filter((r) => r.id !== mine.id)] : reviews;

  return (
    <Section
      id="reviews"
      title="Reviews"
      icon={<Star aria-hidden="true" focusable="false" />}
      action={
        <Button variant="secondary" onClick={() => setOpen(true)} className="min-h-11">
          <PenLine aria-hidden="true" focusable="false" className="size-4" />
          Write a review
        </Button>
      }
    >
      {stats && stats.averageRating != null && stats.reviewCount > 0 ? (
        <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="shrink-0 text-center sm:w-36">
            <p className="text-4xl font-extrabold leading-none text-ink">{formatScore(stats.averageRating)}</p>
            <RatingStars value={stats.averageRating} size="md" className="mt-1.5" />
            <p className="mt-1 text-xs text-mocha">
              {stats.reviewCount} review{stats.reviewCount === 1 ? "" : "s"}
            </p>
            {stats.sampleCount > 0 && <Badge variant="sample" className="mt-1.5" />}
          </div>
          <ul className="min-w-0 flex-1 space-y-1">
            {ratingBars(stats).map((b) => (
              <li key={b.star} className="flex items-center gap-2 text-xs text-mocha">
                <span className="w-6 shrink-0 text-right font-bold">{b.star}</span>
                <Star aria-hidden="true" focusable="false" className="size-3 shrink-0 text-sunset" fill="currentColor" strokeWidth={0} />
                <span aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-mist">
                  <span className="block h-full rounded-full bg-sunset" style={{ width: `${b.percent}%` }} />
                </span>
                <span className="w-6 shrink-0">{b.count}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-cocoa">No reviews yet. If you have been, yours would be the first.</p>
        </Card>
      )}

      {all.length > 0 && (
        <ul className="space-y-3">
          {all.map((r) => (
            <li key={r.id}>
              <Card as="article" className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <RatingStars value={r.rating} size="sm" />
                  <span className="text-sm font-extrabold text-ink">{formatScore(r.rating)}</span>
                  <span className="text-xs text-mocha">
                    <RelativeTime at={r.created_at} />
                  </span>
                  {r.is_sample && <Badge variant="sample" />}
                </div>
                {r.body && <p className="text-sm leading-relaxed text-cocoa">{r.body}</p>}
                {r.photo_urls.length > 0 && (
                  <ul className="flex flex-wrap gap-2">
                    {r.photo_urls.map((url) => (
                      <li key={url}>
                        <Image
                          src={url}
                          alt=""
                          width={160}
                          height={160}
                          sizes="112px"
                          className="size-28 rounded-xl border border-mist object-cover"
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ReviewSheet park={park} open={open} onOpenChange={setOpen} onSubmitted={setMine} />
    </Section>
  );
}
