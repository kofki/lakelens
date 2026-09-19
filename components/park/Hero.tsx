import Image from "next/image";
import { MapPin, ShieldCheck, ShieldOff, ShieldQuestionMark } from "lucide-react";
import type { Park } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { GUARDED_TEXT, OPERATOR_TEXT, PARK_TYPE_TEXT, canOptimizeImage } from "./format";

export interface HeroProps {
  park: Park;
}

/**
 * Detail-page hero (beachlens.net style): full-width photo or a brand gradient
 * placeholder, park name, type/operator chip and the lifeguard badge as icon + text.
 */
export function Hero({ park }: HeroProps) {
  const photo = park.photo_url;
  const GuardIcon = park.guarded === "yes" ? ShieldCheck : park.guarded === "no" ? ShieldOff : ShieldQuestionMark;
  return (
    <header className="relative isolate">
      <div className="relative h-56 w-full overflow-hidden bg-cocoa sm:h-72 sm:rounded-b-[2rem]">
        {photo ? (
          <Image
            src={photo}
            alt=""
            fill
            priority
            sizes="(max-width: 768px) 100vw, 768px"
            unoptimized={!canOptimizeImage(photo)}
            className="object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-full w-full items-end justify-end bg-gradient-to-br from-lagoon via-aqua to-peach p-4"
          >
            <span className="select-none text-6xl font-extrabold text-white/50">{park.name.charAt(0)}</span>
          </div>
        )}
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-cocoa/85 via-cocoa/30 to-transparent" />
      </div>

      <div className="mx-auto -mt-16 w-full max-w-2xl px-4">
        <div className="relative z-10 space-y-2 text-white drop-shadow-[0_1px_2px_rgb(61_37_24/0.8)]">
          <p className="inline-flex items-center gap-1 rounded-full bg-cocoa/70 px-2.5 py-1 text-xs font-bold">
            <MapPin aria-hidden="true" focusable="false" className="size-3.5" />
            {PARK_TYPE_TEXT[park.type]} · {OPERATOR_TEXT[park.operator]}
          </p>
          <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">{park.name}</h1>
        </div>
        <div className="relative z-10 mt-3 flex flex-wrap items-center gap-2">
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
    </header>
  );
}
