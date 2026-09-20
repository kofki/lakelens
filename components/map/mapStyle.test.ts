import { describe, expect, it } from "vitest";
import { BRAND_PAINT_LAYERS } from "./mapStyle";

/**
 * The basemap is fetched at runtime, so a layer id that does not exist fails silently:
 * `setPaintProperty` is wrapped in a try/catch and the map simply stays the wrong colour.
 * This pins the ids against the style we actually load, and two of them were wrong when
 * it was written (`landcover_grass` and `water_name` do not exist in Positron).
 */
describe("brand paint layer ids", () => {
  it("only names layers Positron actually has", async () => {
    const res = await fetch("https://tiles.openfreemap.org/styles/positron");
    if (!res.ok) return; // offline: this check is advisory, not a gate on the build
    const style = (await res.json()) as { layers: { id: string }[] };
    const ids = new Set(style.layers.map((l) => l.id));
    const missing = BRAND_PAINT_LAYERS.filter((id) => !ids.has(id));
    expect(missing, `layers not in the style: ${missing.join(", ")}`).toEqual([]);
  }, 20_000);
});
