import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSun, Snowflake, Sun, Wind } from "lucide-react";
import { weatherGlyph } from "@/lib/weatherIcon";
import { cn } from "./cn";

const ICONS = {
  sun: Sun,
  "cloud-sun": CloudSun,
  cloud: Cloud,
  rain: CloudRain,
  storm: CloudLightning,
  fog: CloudFog,
  snow: Snowflake,
  wind: Wind,
} as const;

export interface WeatherGlyphProps {
  shortForecast: string | null | undefined;
  className?: string;
}

/** Decorative: the forecast text is always adjacent or in the accessible name. */
export function WeatherGlyph({ shortForecast, className }: WeatherGlyphProps) {
  const Icon = ICONS[weatherGlyph(shortForecast)];
  return <Icon aria-hidden="true" focusable="false" className={cn("size-5 text-taupe", className)} />;
}
