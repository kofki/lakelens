"use client";

import { useState } from "react";
import { REPORT_VALUE_LABELS, type Report } from "@/lib/types";
import { confirmReport } from "@/lib/reports";
import { getDeviceId } from "@/lib/deviceId";
import { relativeTime } from "@/lib/freshness";
import { Button } from "@/components/ui/Button";

export interface StillTruePromptProps {
  report: Report;
  now: Date;
  onAnswered?: () => void;
}

/** Waze-style "Still full?" prompt shown when a full/turned-away report is getting old. */
export function StillTruePrompt({ report, now, onAnswered }: StillTruePromptProps) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function answer(response: "still_true" | "no_longer") {
    setState("sending");
    const result = await confirmReport({ type: "confirmation", report_id: report.id, device_id: getDeviceId(), response });
    if (result.ok) {
      setState("done");
      setMessage(response === "still_true" ? "Thanks — we'll keep this status up." : "Thanks — we'll ease off this status.");
      onAnswered?.();
    } else {
      setState("error");
      setMessage(result.error ?? "Couldn't send that right now.");
    }
  }

  const label = REPORT_VALUE_LABELS[report.value] ?? report.value;

  return (
    <div className="rounded-xl bg-peach p-3" role="group" aria-label="Confirm the latest report">
      <p className="text-sm font-extrabold text-cocoa">
        Still {label.toLowerCase()}? <span className="font-normal text-mocha">Reported {relativeTime(report.created_at, now)}.</span>
      </p>
      {state === "done" || state === "error" ? (
        <p className="mt-1 text-sm text-cocoa" role="status">
          {message}
        </p>
      ) : (
        <div className="mt-2 flex gap-2">
          <Button type="button" variant="primary" onClick={() => answer("still_true")} disabled={state === "sending"}>
            Yes, still {label.toLowerCase()}
          </Button>
          <Button type="button" variant="secondary" onClick={() => answer("no_longer")} disabled={state === "sending"}>
            No, not anymore
          </Button>
        </div>
      )}
    </div>
  );
}
