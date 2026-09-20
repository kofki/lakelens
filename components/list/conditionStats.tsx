import { Biohazard, CloudSun, FlaskConical, Sun, Thermometer, Waves } from "lucide-react";
import type { ParkWithStatus } from "@/lib/types";
import { describeWaterTemp } from "@/lib/plainLanguage";
import type { StatRowItem } from "@/components/ui/StatRow";

/** True when the park has any live reading worth putting on a card. */
export function hasConditionData(item: ParkWithStatus): boolean {
  return Boolean(item.usgs || item.noaa || item.weather || item.forecast);
}

/**
 * The stat strip on cards and the map preview: at most three, and only ones we actually
 * measured. Flow used to sit in the middle slot; UV replaced it, because sun exposure
 * changes the plan for every visitor while discharge only matters to swimmers in a river.
 */
export function conditionStatItems(item: ParkWithStatus): StatRowItem[] {
  const temp = describeWaterTemp(item.usgs, item.park);
  const noaaTemp = temp.typical || temp.valueF == null ? item.noaa?.readings.find((r) => r.parameter === "water_temp" && !r.stale) ?? null : null;
  const waterF = noaaTemp ? Math.round(noaaTemp.value) : temp.valueF;
  const uv = item.forecast?.nowUv ?? item.forecast?.uvPeak ?? null;
  const feels = item.forecast?.nowFeelsLikeF ?? null;
  const airF = feels ?? item.forecast?.nowTempF ?? item.weather?.current?.tempF ?? null;
  const beachWater = item.forecast?.beachWaterQuality ?? null;
  const redTide = item.forecast?.redTide ?? null;
  const quality = item.forecast?.waterQuality ?? null;

  const items: StatRowItem[] = [];
  if (typeof airF === "number" && Number.isFinite(airF)) {
    items.push({
      icon: <CloudSun aria-hidden="true" focusable="false" />,
      label: feels != null ? "Feels like" : "Air",
      value: `${Math.round(airF)}°F`,
    });
  }
  // A posted advisory or an active bloom outranks UV in the middle slot: it is the one
  // reading that decides whether to get in the water at all.
  if (beachWater && beachWater.level !== "good") {
    items.push({ icon: <FlaskConical aria-hidden="true" focusable="false" />, label: "Water quality", value: beachWater.label });
  } else if (redTide && redTide.level !== "none") {
    items.push({ icon: <Biohazard aria-hidden="true" focusable="false" />, label: "Red tide", value: redTide.label });
  } else if (quality && quality.level !== "clear") {
    items.push({ icon: <FlaskConical aria-hidden="true" focusable="false" />, label: "Water quality", value: quality.label });
  } else if (uv != null) {
    items.push({ icon: <Sun aria-hidden="true" focusable="false" />, label: "UV", value: String(Math.round(uv)) });
  } else if (beachWater ?? quality) {
    const q = beachWater ?? quality!;
    items.push({ icon: <FlaskConical aria-hidden="true" focusable="false" />, label: "Water quality", value: q.label });
  }
  if (waterF != null) {
    items.push({
      icon: <Thermometer aria-hidden="true" focusable="false" />,
      label: temp.typical && !noaaTemp ? "Water (typical)" : "Water",
      value: `${waterF}°F`,
    });
  } else if (item.noaa?.nextTide) {
    items.push({
      icon: <Waves aria-hidden="true" focusable="false" />,
      label: "Next tide",
      value: `${item.noaa.nextTide.type === "H" ? "High" : "Low"} ${item.noaa.nextTide.valueFt.toFixed(1)} ft`,
    });
  }
  return items.slice(0, 3);
}
