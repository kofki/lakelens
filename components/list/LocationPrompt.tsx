"use client";

import { useSyncExternalStore } from "react";
import { LocateFixed, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  getPromptChoice,
  getPromptChoiceServer,
  setPromptChoice,
  shouldOfferLocation,
  subscribePromptChoice,
  type PromptChoice,
} from "@/lib/onboarding";

export interface LocationPromptProps {
  status: string;
  onRequest: () => void;
  /** Rendered instead of the ask once the browser has refused, so the reader is not stuck. */
  fallback?: React.ReactNode;
}

/**
 * The one thing worth asking a first-time reader.
 *
 * Distance is the only sort that answers "where can I swim today", and a browser will not
 * hand over a location unless something asks. Nothing asked, so the default order was
 * alphabetical and the first screen was five Chicago beaches whoever you are and wherever
 * you live.
 *
 * Asked once. The browser's own permission is the record after that, so a reader who has
 * already granted or refused never sees this.
 */
export function LocationPrompt({ status, onRequest, fallback }: LocationPromptProps) {
  const choice = useSyncExternalStore(subscribePromptChoice, getPromptChoice, getPromptChoiceServer);

  const decide = (next: PromptChoice) => {
    setPromptChoice(next);
    if (next === "asked") onRequest();
  };

  if (status === "denied" && fallback) return <>{fallback}</>;
  if (!shouldOfferLocation(status, choice)) return null;

  return (
    <section
      aria-labelledby="location-prompt-heading"
      className="relative mx-auto mt-4 flex max-w-[1280px] flex-col gap-3 rounded-tile border border-mist bg-white p-4 shadow-card sm:flex-row sm:items-center"
    >
      <LocateFixed aria-hidden="true" focusable="false" className="size-6 shrink-0 text-forest" />
      <div className="min-w-0 flex-1">
        <h2 id="location-prompt-heading" className="text-base font-extrabold text-ink">
          Show the closest spots first
        </h2>
        <p className="mt-0.5 text-sm text-mocha">
          There are swim spots in every state. Sharing your location puts the nearest ones at the top. It stays in your
          browser.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button type="button" onClick={() => decide("asked")}>
          Use my location
        </Button>
        <button
          type="button"
          onClick={() => decide("dismissed")}
          aria-label="Not now"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-mocha hover:bg-mist-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-taupe"
        >
          <X aria-hidden="true" focusable="false" className="size-5" />
        </button>
      </div>
    </section>
  );
}
