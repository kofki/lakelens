/**
 * NWS short forecast text to an icon name.
 *
 * NWS gives prose ("Chance Showers And Thunderstorms"), and the forecast strip used to
 * render that prose or nothing at all. A glyph reads at a glance and costs no width, which
 * is the whole point of the 7-day row. Pure TS: the component maps the name to a lucide
 * component, so lib/ stays free of React imports.
 */
export type WeatherGlyph = "sun" | "cloud-sun" | "cloud" | "rain" | "storm" | "fog" | "snow" | "wind";

/** Ordered because NWS strings combine conditions: "Sunny then Chance Thunderstorms". */
const RULES: [RegExp, WeatherGlyph][] = [
  [/thunder|tstorm/i, "storm"],
  [/snow|sleet|flurr|ice|freezing/i, "snow"],
  [/rain|shower|drizzle/i, "rain"],
  [/fog|haze|smoke/i, "fog"],
  [/wind|breezy|blustery/i, "wind"],
  [/mostly cloudy|overcast|cloudy/i, "cloud"],
  [/partly sunny|partly cloudy|mostly sunny|mostly clear|few clouds/i, "cloud-sun"],
  [/sunny|clear|fair|hot/i, "sun"],
];

export function weatherGlyph(shortForecast: string | null | undefined): WeatherGlyph {
  const text = (shortForecast ?? "").trim();
  if (!text) return "cloud";
  for (const [re, glyph] of RULES) if (re.test(text)) return glyph;
  return "cloud";
}
