"use client";

import { useId, useState } from "react";
import Image from "next/image";
import { Camera, Star, X } from "lucide-react";
import type { Park, Review } from "@/lib/types";
import { REVIEW_BODY_MAX, REVIEW_MAX_PHOTOS } from "@/lib/types";
import { submitReview, uploadReviewPhoto } from "@/lib/reviews";
import { getDeviceId } from "@/lib/deviceId";
import { Button } from "@/components/ui/Button";
import { ModalSheet } from "@/components/sheet/ModalSheet";
import { cn } from "@/components/ui/cn";

export interface ReviewSheetProps {
  park: Park;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted?: (review: Review) => void;
}

const RATING_LABEL = ["Poor", "Not great", "Fine", "Good", "Excellent"] as const;

export function ReviewSheet({ park, open, onOpenChange, onSubmitted }: ReviewSheetProps) {
  const [rating, setRating] = useState<number>(0);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const bodyId = useId();
  const photoId = useId();

  // Reset each time the sheet opens (state adjustment during render, per the React docs).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setRating(0);
      setBody("");
      setFiles([]);
      setState("idle");
      setError(null);
    }
  }

  async function send() {
    if (rating < 1) return;
    setState("sending");
    setError(null);
    const deviceId = getDeviceId();

    // A photo that fails to upload must not silently vanish: the review is held back and
    // the person is told, rather than posted without the picture they chose.
    const urls: string[] = [];
    for (const file of files.slice(0, REVIEW_MAX_PHOTOS)) {
      const url = await uploadReviewPhoto(file, deviceId);
      if (!url) {
        setState("error");
        setError("One of those photos could not be uploaded. Remove it and try again.");
        return;
      }
      urls.push(url);
    }

    const result = await submitReview({
      park_id: park.id,
      rating,
      body: body.trim() || null,
      photo_urls: urls,
      device_id: deviceId,
    });
    if (!result.ok) {
      setState("error");
      setError(result.error);
      return;
    }
    setState("done");
    onSubmitted?.(result.review);
  }

  return (
    <ModalSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Review ${park.name}`}
      description="Your rating helps the next person decide whether to make the drive."
    >
      {state === "done" ? (
        <div className="space-y-3">
          <p className="text-sm font-bold text-cocoa">Thanks. Your review is live.</p>
          <Button onClick={() => onOpenChange(false)} full>
            Close
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <fieldset>
            <legend className="text-sm font-bold text-cocoa">How was it?</legend>
            <div className="mt-2 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  aria-pressed={rating === n}
                  aria-label={`${n} star${n === 1 ? "" : "s"}: ${RATING_LABEL[n - 1]}`}
                  className="flex size-11 items-center justify-center rounded-full hover:bg-mist/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-taupe"
                >
                  <Star
                    className={cn("size-7", n <= rating ? "text-sunset" : "text-mist")}
                    fill="currentColor"
                    strokeWidth={0}
                    aria-hidden="true"
                  />
                </button>
              ))}
              {rating > 0 && <span className="ml-1 text-sm font-bold text-cocoa">{RATING_LABEL[rating - 1]}</span>}
            </div>
          </fieldset>

          <div>
            <label htmlFor={bodyId} className="text-sm font-bold text-cocoa">
              Tell people what it was like (optional)
            </label>
            <textarea
              id={bodyId}
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, REVIEW_BODY_MAX))}
              rows={4}
              placeholder="e.g. Got there at 9 and the lot was already half full. Water was clear and cold."
              className="mt-1 w-full rounded-xl border border-mist bg-white p-3 text-sm text-cocoa outline-none focus-visible:border-moss"
            />
            <p className="text-right text-xs text-mocha">
              {body.length}/{REVIEW_BODY_MAX}
            </p>
          </div>

          <div>
            <label
              htmlFor={photoId}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-mist bg-white px-4 text-sm font-bold text-brown hover:border-moss"
            >
              <Camera aria-hidden="true" focusable="false" className="size-4" />
              Add photos (up to {REVIEW_MAX_PHOTOS})
            </label>
            <input
              id={photoId}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, REVIEW_MAX_PHOTOS))}
            />
            {files.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="relative">
                    <Image
                      src={URL.createObjectURL(f)}
                      alt=""
                      width={64}
                      height={64}
                      unoptimized
                      className="size-16 rounded-xl border border-mist object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setFiles(files.filter((_, j) => j !== i))}
                      aria-label={`Remove photo ${i + 1}`}
                      className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-brown text-white shadow-card"
                    >
                      <X aria-hidden="true" focusable="false" className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && (
            <p role="alert" className="text-sm font-bold text-status-full">
              {error}
            </p>
          )}

          <Button onClick={send} disabled={rating < 1 || state === "sending"} full>
            {state === "sending" ? "Sending" : "Post review"}
          </Button>
          <p className="text-xs text-mocha">
            No account needed. We store an anonymous device id so you can edit your review later.
          </p>
        </div>
      )}
    </ModalSheet>
  );
}
