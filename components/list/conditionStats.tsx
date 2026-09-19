import { CloudSun, Thermometer, Waves } from "lucide-react";
import type { ParkWithStatus } from "@/lib/types";
import { describeFlow, describeWaterTemp } from "@/lib/plainLanguage";
import type { StatRowItem } from "@/components/ui/StatRow";

const FLOW_LABEL = { normal: "Normal", high: "High", unknown: "No data" } as const;

/** True when the park has any live USGS or weather payload to show. */
export function hasConditionData(item: ParkWithStatus): boolean {
  return Boolean(item.usgs || item.weather);
}

/** The 3-stat row (water temp / flow / weather) used on cards and the map preview. */
export function conditionStatItems(item: ParkWithStatus): StatRowItem[] {
  const temp = describeWaterTemp(item.usgs, item.park);
  const flow = describeFlow(item.usgs, item.park);
  const airF = item.weather?.current?.tempF;
  return [
    {
      icon: <Thermometer aria-hidden="true" focusable="false" />,
      label: temp.typical ? "Water (typical)" : "Water",
      value: temp.valueF != null ? `${Math.round(temp.valueF)}°F` : "No data",
    },
    {
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
