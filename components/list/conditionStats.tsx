import { CloudSun, Thermometer, Waves } from "lucide-react";
import type { ParkWithStatus } from "@/lib/types";
import { describeFlow, describeWaterTemp } from "@/lib/plainLanguage";
import type { StatRowItem } from "@/components/ui/StatRow";

const FLOW_LABEL = { normal: "Normal", high: "High", unknown: "No data" } as const;

/** True when the park has any live USGS, NOAA or weather payload to show. */
export function hasConditionData(item: ParkWithStatus): boolean {
  return Boolean(item.usgs || item.noaa || item.weather);
}

/**
 * The 3-stat row (water temp / flow or tide / weather) used on cards and the map preview.
 * Coastal parks have no USGS gauge, so their water temperature comes from the park's NOAA CO-OPS
 * station and the middle stat becomes the tide height instead of river flow.
 */
export function conditionStatItems(item: ParkWithStatus): StatRowItem[] {
  const temp = describeWaterTemp(item.usgs, item.park);
  const flow = describeFlow(item.usgs, item.park);
  const airF = item.weather?.current?.tempF;
  // Only fall back to NOAA when USGS has no live temperature of its own.
  const noaaTemp = temp.typical || temp.valueF == null ? item.noaa?.readings.find((r) => r.parameter === "water_temp" && !r.stale) ?? null : null;
  const noaaLevel = item.noaa?.readings.find((r) => r.parameter === "water_level" && !r.stale) ?? null;
  const usesNoaaTide = !item.usgs && Boolean(item.noaa);
  return [
    noaaTemp
      ? {
          icon: <Thermometer aria-hidden="true" focusable="false" />,
          label: "Water",
          value: `${Math.round(noaaTemp.value)}°F`,
        }
      : {
          icon: <Thermometer aria-hidden="true" focusable="false" />,
          label: temp.typical ? "Water (typical)" : "Water",
          value: temp.valueF != null ? `${Math.round(temp.valueF)}°F` : "No data",
        },
    usesNoaaTide
      ? {
          icon: <Waves aria-hidden="true" focusable="false" />,
          label: "Tide",
          value: noaaLevel ? `${noaaLevel.value.toFixed(1)} ft` : "No data",
        }
      : {
          icon: <Waves aria-hidden="true" focusable="false" />,
          label: "Flow",
          value: FLOW_LABEL[flow.level] ?? "No data",
        },
    {
      icon: <CloudSun aria-hidden="true" focusable="false" />,
      label: "Air",
      value: typeof airF === "number" && Number.isFinite(airF) ? `${Math.round(airF)}°F` : "No data",
    },
  ];
}
