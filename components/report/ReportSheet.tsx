"use client";

import { useId, useState } from "react";
import { Camera, Check } from "lucide-react";
import {
  REPORT_CATEGORY_LABELS,
  REPORT_VALUES,
  REPORT_VALUE_LABELS,
  type Park,
  type Report,
  type ReportCategory,
  type ReportValue,
} from "@/lib/types";
import { submitReport, uploadReportPhoto } from "@/lib/reports";
import { getDeviceId } from "@/lib/deviceId";
import { Button } from "@/components/ui/Button";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { cn } from "@/components/ui/cn";
import { ModalSheet } from "@/components/sheet/ModalSheet";

export interface ReportSheetProps {
  park: Park;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted?: (report: Report) => void;
}

const CATEGORIES = (Object.keys(REPORT_CATEGORY_LABELS) as ReportCategory[]).map((id) => ({ id, label: REPORT_CATEGORY_LABELS[id] }));
const NOTE_MAX = 280;

export function ReportSheet({ park, open, onOpenChange, onSubmitted }: ReportSheetProps) {
  const [category, setCategory] = useState<ReportCategory>("entry");
  const [value, setValue] = useState<ReportValue | null>(null);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [blockedUntilReopen, setBlockedUntilReopen] = useState(false);
  const noteId = useId();
  const photoId = useId();

  // Reset the form each time the sheet opens (state adjustment during render, per React docs).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setState("idle");
      setError(null);
      setValue(null);
      setNote("");
      setPhoto(null);
      setBlockedUntilReopen(false);
    }
  }

  async function send() {
    if (!value) return;
    setState("sending");
    setError(null);
    const deviceId = getDeviceId();
    const photoUrl = photo ? await uploadReportPhoto(photo, deviceId) : null;
    const result = await submitReport({
      park_id: park.id,
      category,
      value,
      note: note.trim() ? note.trim().slice(0, NOTE_MAX) : null,
      photo_url: photoUrl,
      device_id: deviceId,
    });
    if (result.ok) {
      setState("done");
      onSubmitted?.(result.report);
    } else {
      setState("error");
      setError(result.error);
      if (result.status === 429) setBlockedUntilReopen(true);
    }
  }

  const values = REPORT_VALUES[category];

  return (
    <ModalSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Report conditions at ${park.name}`}
      description="One tap is enough. Reports fade after about two hours and are shown to everyone."
    >
      {state === "done" ? (
        <div role="status" className="rounded-xl bg-aqua/60 p-4 text-cocoa">
          <p className="flex items-center gap-2 text-base font-extrabold">
            <Check aria-hidden="true" focusable="false" className="h-5 w-5 text-status-open" />
            Thanks — your report helps others.
          </p>
          <p className="mt-1 text-sm">It&apos;s live now and will fade after about two hours.</p>
          <Button type="button" variant="secondary" className="mt-3" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="space-y-4"
        >
          <SegmentedTabs
            tabs={CATEGORIES}
            value={category}
            onChange={(id) => {
              setCategory(id as ReportCategory);
              setValue(null);
            }}
            ariaLabel="Report category"
          />

          <fieldset>
            <legend className="mb-2 text-sm font-bold text-mocha">What did you see?</legend>
            <div className="grid grid-cols-2 gap-2">
              {values.map((v) => {
                const selected = value === v;
                return (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setValue(v)}
                    className={cn(
                      "min-h-12 rounded-full border-2 px-3 text-sm font-extrabold transition-colors",
                      selected ? "border-sunset bg-sunset text-white" : "border-mist bg-white text-cocoa hover:border-sand",
                    )}
                  >
                    {selected && <Check aria-hidden="true" focusable="false" className="mr-1 inline h-4 w-4" />}
                    {REPORT_VALUE_LABELS[v]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div>
            <label htmlFor={noteId} className="text-sm font-bold text-mocha">
              Add a note <span className="font-normal">(optional)</span>
            </label>
            <textarea
              id={noteId}
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
              rows={2}
              maxLength={NOTE_MAX}
              className="mt-1 w-full rounded-xl border-2 border-mist bg-white p-3 text-sm text-cocoa focus:border-sunset"
              placeholder="e.g. Turned away at the gate at 10:15"
            />
            <p className="mt-1 text-right text-xs text-mocha" aria-live="polite">
              {note.length}/{NOTE_MAX}
            </p>
          </div>

          <div>
            <label htmlFor={photoId} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-2 border-mist bg-white px-4 text-sm font-bold text-cocoa">
              <Camera aria-hidden="true" focusable="false" className="h-4 w-4" />
              {photo ? `Photo: ${photo.name}` : "Add a photo (optional)"}
            </label>
            <input
              id={photoId}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-peach/60 p-3 text-sm font-bold text-cocoa">
              {error}
            </p>
          )}

          <Button type="submit" variant="primary" size="lg" full disabled={!value || state === "sending" || blockedUntilReopen}>
            {state === "sending" ? "Sending…" : "Send report"}
          </Button>
          <p className="text-xs text-mocha">No account needed. We store an anonymous device id to limit spam.</p>
        </form>
      )}
    </ModalSheet>
  );
}
