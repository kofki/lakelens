/**
 * The two or three readings a card shows, computed on the server.
 *
 * Cards used to receive the whole conditions payload for every park (USGS, NOAA, the NWS
 * weather object and the forecast row) and derive three short strings from it in the
 * browser. At 2,100 parks that was most of the page weight, and none of it was rendered:
 * a card draws "Feels like 78°F", "UV 6", "Water 72°F" and throws the rest away.
 *
 * Deriving it here means the objects never cross the wire. The park page still gets the
 * full payload, because it draws the parts a card does not.
 */
import type { ParkWithStatus } from "./types";
import { describeWaterTemp } from "./plainLanguage";

/** Which icon a stat gets. A name rather than a component, so this file stays free of JSX. */
export type CardStatKind = "air" | "uv" | "water" | "quality";

export interface CardStat {
  kind: CardStatKind;
  label: string;
  value: string;
}

export function cardStatsFor(item: ParkWithStatus): CardStat[] {
  const temp = describeWaterTemp(item.usgs, item.park);
  const noaaTemp =
    temp.typical || temp.valueF == null
      ? (item.noaa?.readings.find((r) => r.parameter === "water_temp" && !r.stale) ?? null)
      : null;
  const waterF = noaaTemp ? Math.round(noaaTemp.value) : temp.valueF;
  const uv = item.forecast?.nowUv ?? item.forecast?.uvPeak ?? null;
  const feels = item.forecast?.nowFeelsLikeF ?? null;
  const airF = feels ?? item.forecast?.nowTempF ?? item.weather?.current?.tempF ?? null;
  const quality = item.forecast?.waterQuality ?? null;

  const out: CardStat[] = [];
  if (typeof airF === "number" && Number.isFinite(airF)) {
    out.push({ kind: "air", label: feels != null ? "Feels like" : "Air", value: `${Math.round(airF)}°F` });
  }
  // An active bloom outranks UV in the middle slot: it is the one reading that decides
  // whether to get in the water at all.
  if (quality && quality.level !== "clear") {
    out.push({ kind: "quality", label: "Water quality", value: quality.label });
  } else if (uv != null) {
    out.push({ kind: "uv", label: "UV", value: String(Math.round(uv)) });
  } else if (quality) {
    out.push({ kind: "quality", label: "Water quality", value: quality.label });
  }
  if (waterF != null) {
    out.push({
      kind: "water",
      label: temp.typical && !noaaTemp ? "Water (typical)" : "Water",
      value: `${waterF}°F`,
    });
  }
  return out.slice(0, 3);
}
