"use client";

export interface LiveRegionProps {
  message: string;
  politeness?: "polite" | "assertive";
}

/**
 * Screen-reader announcement area. Keep it mounted and change `message`
 * (e.g. "12 parks match your filters", "Report sent").
 */
export function LiveRegion({ message, politeness = "polite" }: LiveRegionProps) {
  return (
    <div
      role={politeness === "assertive" ? "alert" : "status"}
      aria-live={politeness}
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
}
