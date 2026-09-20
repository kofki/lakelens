import { ImageResponse } from "next/og";
import { getParkBundle } from "@/lib/queries";
import { STATUS_META, statusShortReason } from "@/lib/status";
import { parkLocation } from "@/components/list/parkListUtils";

/**
 * The card people see when a park is shared.
 *
 * Without this, a link to a lake was text only: a title, a sentence, and whatever the
 * platform chose to do with it. Most of these parks have no photograph at all, so falling
 * back to the park's own image was never going to cover them. This draws the three things
 * that make a link worth opening, from data every park has: what the place is called, what
 * water it is on and where, and whether it is open right now.
 *
 * Rendered on demand and cached by the same revalidate as the page.
 */
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "LakeLens park summary";

const CREAM = "#f5f3ea";
const FOREST = "#1f4d3a";
const LAGOON = "#0f6f76";
const INK = "#1c1b17";
const MOCHA = "#5b6657";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const bundle = await getParkBundle(slug).catch(() => null);

  const name = bundle?.park.name ?? "LakeLens";
  const water = bundle?.park.water_body ?? null;
  const where = bundle ? parkLocation(bundle.park) : null;
  const status = bundle ? statusShortReason(bundle.status) : null;
  // The pill has to carry the status, not just say it: a shut park in reassuring green is
  // worse than no pill. STATUS_META already holds the AA-checked pairs the app uses.
  const meta = bundle ? STATUS_META[bundle.status.level] : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: CREAM,
          padding: 72,
          // A wide band of the lagoon colour down the left edge, so the card is
          // recognisable as ours at thumbnail size without reading a word of it.
          borderLeft: `24px solid ${LAGOON}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, color: FOREST, fontSize: 30, fontWeight: 800 }}>
          LakeLens
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              fontSize: name.length > 34 ? 68 : 84,
              fontWeight: 800,
              color: INK,
              lineHeight: 1.05,
              // Two lines at most: a third would push the status line off the card.
              display: "block",
              maxHeight: 200,
              overflow: "hidden",
            }}
          >
            {name}
          </div>
          {(water || where) && (
            <div style={{ fontSize: 34, color: MOCHA, display: "flex" }}>
              {[water, where].filter(Boolean).join("  ·  ")}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {status && (
            <div
              style={{
                display: "flex",
                fontSize: 30,
                fontWeight: 700,
                color: meta?.hex ?? CREAM,
                background: meta?.bgHex ?? FOREST,
                border: `3px solid ${meta?.edgeHex ?? FOREST}`,
                padding: "14px 28px",
                borderRadius: 999,
              }}
            >
              {status}
            </div>
          )}
          <div style={{ display: "flex", fontSize: 26, color: MOCHA }}>Freshwater swim spots across the US</div>
        </div>
      </div>
    ),
    size,
  );
}
