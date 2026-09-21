import { hasKnownStatus } from "@/lib/status";
import Image from "next/image";
import { MapPin, ShieldCheck, ShieldOff, ShieldQuestionMark } from "lucide-react";
import type { Park, ParkStatus, ReviewStats } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Score } from "@/components/ui/RatingStars";
import { StatusPill } from "@/components/ui/StatusPill";
import {GUARDED_TEXT, OPERATOR_TEXT, PARK_TYPE_TEXT, canOptimizeImage} from "./format";
import { FavoriteButton } from "./FavoriteButton";

export interface HeroProps {
  park: Park;
  /** When given, the status pill sits to the right of the title on md+. */
  status?: ParkStatus;
  /** The score under the title, linking down to the reviews. */
  reviewStats?: ReviewStats | null;
}

/**
 * Detail-page hero. The photo is full-bleed on phones and a
 * rounded card on md+; the title block always sits below the photo so long names never
 * overlap the image. Lifeguard status is icon + text, never colour alone.
 */
export function Hero({ park, status, reviewStats }: HeroProps) {
  const photo = park.photo_url;
  // No author means no credit line at all: a photo labelled "Unknown" credits nobody.
  const credit = park.photo_author
    ? park.photo_license
      ? `${park.photo_author} (${park.photo_license})`
      : park.photo_author
    : null;
  const GuardIcon = park.guarded === "yes" ? ShieldCheck : park.guarded === "no" ? ShieldOff : ShieldQuestionMark;
  return (
    <header>
      <div className="relative -mx-4 h-56 overflow-hidden bg-cocoa sm:h-72 md:mx-0 md:mt-6 md:h-[420px] md:rounded-[20px] md:shadow-card">
        {photo ? (
          <Image
            src={photo}
            alt=""
            fill
            priority
            sizes="(min-width: 1100px) 1052px, 100vw"
            unoptimized={!canOptimizeImage(photo)}
            className="object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-full w-full items-end justify-end bg-gradient-to-br from-brown via-lagoon to-aqua p-4"
          >
            <span className="select-none text-6xl font-extrabold text-white/50 md:text-8xl">{park.name.charAt(0)}</span>
          </div>
        )}
      </div>

      {photo && credit && (
        /*
         * Sits below the image rather than over it: a scrim would compete with the park name and
         * has to survive whatever the photo does behind it. This is a licence obligation, so it is
         * quiet by design, and the link is deliberately under the 44px touch target: it is a
         * provenance link, not a primary control.
         */
        <p className="mt-2 text-xs text-mocha">
          Photo:{" "}
          {park.photo_source_url ? (
            <a
              href={park.photo_source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-taupe"
            >
              {credit}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            credit
          )}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4 md:mt-6">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="inline-flex items-center gap-1 text-[0.95rem] font-bold text-mocha">
            <MapPin aria-hidden="true" focusable="false" className="size-4 shrink-0" />
            {/* The named water is the more useful of the two: "Lake Winnebago" says where you
                are standing in a way "Lake" never does. It is only known for parks that have
                been through the water check, so the type stays as the fallback. */}
            {park.water_body ?? PARK_TYPE_TEXT[park.type]} · {OPERATOR_TEXT[park.operator]}
          </p>
          <div className="flex items-start gap-2">
            <h1 className="min-w-0 flex-1 text-[1.75rem] font-extrabold leading-tight text-ink md:text-[2.25rem]">
              {park.name}
            </h1>
            <FavoriteButton slug={park.slug} name={park.name} className="mt-1 shrink-0" />
          </div>
          {reviewStats && reviewStats.averageRating != null && reviewStats.reviewCount > 0 && (
            <a href="#reviews" className="inline-flex rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-taupe">
              <Score
                average={reviewStats.averageRating}
                count={reviewStats.reviewCount}
                sampleCount={reviewStats.sampleCount}
                size="lg"
              />
            </a>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span
              className={
                park.guarded === "no"
                  ? "inline-flex items-center gap-1.5 rounded-full border border-status-full-edge bg-status-full-bg px-3 py-1 text-sm font-bold text-status-full"
                  : "inline-flex items-center gap-1.5 rounded-full border border-mist bg-white px-3 py-1 text-sm font-bold text-cocoa"
              }
            >
              <GuardIcon aria-hidden="true" focusable="false" className="size-4 shrink-0" strokeWidth={2.25} />
              {GUARDED_TEXT[park.guarded]}
            </span>
            {!park.swimming_verified && <Badge variant="unverified">Swimming not yet verified</Badge>}
          </div>
        </div>

        {status && (
          <div className="hidden shrink-0 md:flex">
            {hasKnownStatus(status) && <StatusPill level={status.level} source={status.source} size="lg" />}
          </div>
        )}
      </div>
    </header>
  );
}
