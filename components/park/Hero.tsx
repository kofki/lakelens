import Image from "next/image";
import { MapPin, ShieldCheck, ShieldOff, ShieldQuestionMark } from "lucide-react";
import type { Park, ParkStatus } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { StatusPill } from "@/components/ui/StatusPill";
import { CONFIDENCE_TEXT, GUARDED_TEXT, OPERATOR_TEXT, PARK_TYPE_TEXT, canOptimizeImage } from "./format";

export interface HeroProps {
  park: Park;
  /** When given, the status pill + confidence sit to the right of the title on md+ (beachlens.net rating position). */
  status?: ParkStatus;
}

/**
 * Detail-page hero (beachlens.net / AllTrails style). The photo is full-bleed on phones and a
 * rounded card on md+; the title block always sits below the photo so long names never
 * overlap the image. Lifeguard status is icon + text, never colour alone.
 */
export function Hero({ park, status }: HeroProps) {
  const photo = park.photo_url;
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
            sizes="(max-width: 768px) 100vw, 1100px"
            unoptimized={!canOptimizeImage(photo)}
            className="object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-full w-full items-end justify-end bg-gradient-to-br from-lagoon via-aqua to-peach p-4"
          >
            <span className="select-none text-6xl font-extrabold text-white/50 md:text-8xl">{park.name.charAt(0)}</span>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4 md:mt-6">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="inline-flex items-center gap-1 text-[0.95rem] font-bold text-mocha">
            <MapPin aria-hidden="true" focusable="false" className="size-4 shrink-0" />
            {PARK_TYPE_TEXT[park.type]} · {OPERATOR_TEXT[park.operator]}
          </p>
          <h1 className="text-[1.75rem] font-extrabold leading-tight text-cocoa md:text-[2.25rem]">{park.name}</h1>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span
              className={
                park.guarded === "no"
                  ? "inline-flex items-center gap-1.5 rounded-full border border-status-full/40 bg-white px-3 py-1 text-sm font-bold text-status-full shadow-card"
                  : "inline-flex items-center gap-1.5 rounded-full border border-mist bg-white px-3 py-1 text-sm font-bold text-cocoa shadow-card"
              }
            >
              <GuardIcon aria-hidden="true" focusable="false" className="size-4 shrink-0" strokeWidth={2.25} />
              {GUARDED_TEXT[park.guarded]}
            </span>
            {park.coverage_tier === "basic" && <Badge variant="info">Basic coverage</Badge>}
            {!park.swimming_verified && <Badge variant="unverified">Swimming not yet verified</Badge>}
          </div>
        </div>

        {status && (
          <div className="hidden shrink-0 flex-col items-end gap-1 md:flex">
            <StatusPill level={status.level} size="lg" estimate={status.isEstimate} />
            <span className="text-sm font-bold text-cocoa/75">{CONFIDENCE_TEXT[status.confidence]}</span>
          </div>
        )}
      </div>
    </header>
  );
}
