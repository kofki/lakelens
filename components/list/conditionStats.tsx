import { CloudSun, FlaskConical, Sun, Thermometer } from "lucide-react";
import type { CardStatKind } from "@/lib/cardStats";
import type { ParkWithStatus } from "@/lib/types";
import type { StatRowItem } from "@/components/ui/StatRow";

const ICONS: Record<CardStatKind, typeof CloudSun> = {
  air: CloudSun,
  uv: Sun,
  water: Thermometer,
  quality: FlaskConical,
};

/** True when the park has any reading worth putting on a card. */
export function hasConditionData(item: ParkWithStatus): boolean {
  return (item.cardStats?.length ?? 0) > 0;
}

/**
 * The stat strip on cards and the map preview.
 *
 * The readings themselves are worked out on the server (lib/cardStats.ts), because
 * shipping the USGS, NOAA, weather and forecast objects to every card so the browser
 * could derive three short strings was most of the page's weight and none of its content.
 * This only turns the result into icons.
 */
export function conditionStatItems(item: ParkWithStatus): StatRowItem[] {
  return (item.cardStats ?? []).map((stat) => {
    const Icon = ICONS[stat.kind];
    return {
      icon: <Icon aria-hidden="true" focusable="false" />,
      label: stat.label,
      value: stat.value,
    };
  });
}
