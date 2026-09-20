/**
 * Ingest normalizer tests against live fixtures captured 2026-09-19 (tests/fixtures/*).
 * No network: fetchers are exercised with an injected fetchImpl.
 */
import { describe, expect, it, vi } from "vitest";
import {
  applySiteQuirks,
  buildUsgsPayloadForPark,
  dedupeNewest,
  fetchUsgsLatest,
  fetchUsgsLatestDetailed,
  flowFlagFor,
  normalizeLegacy,
  normalizeOgc,
  normalizeUnit,
  type LegacyResponse,
  type OgcFeatureCollection,
} from "@/lib/ingest/usgs";
import {
  fetchAlerts,
  matchAlertsToPark,
  normalizeAlertAreas,
  normalizeNws,
  nwsFetchJson,
  nwsHeaders,
  parsePoints,
  parseWindMph,
  roundCoord,
  ugcCode,
  weekdayShort,
  type NwsAlertFeature,
  type NwsForecastResponse,
  type NwsPointsResponse,
} from "@/lib/ingest/nws";
import { buildContinuousUrl, chunk, fetchFlowHistory, normalizeContinuous } from "@/lib/ingest/usgs";
import { haversineKm, parseRdbSites, selectGauges, usgsSitesUrl, isLiveReading, type SiteLiveness } from "@/lib/ingest/gauges";
import {
  NOAA_STALE_MS,
  NoaaApiError,
  buildDataUrl,
  buildPredictionsUrl,
  buildNoaaPayloadForPark,
  extractError,
  fetchNoaaLatest,
  isNoDataMessage,
  noaaBeginDate,
  normalizeNextTide,
  normalizeObservation,
  parseNoaaTime,
  type NoaaDataResponse,
  type NoaaPredictionsResponse,
} from "@/lib/ingest/noaa";
import {
  algaeAlertHash,
  algaeAlertText,
  algaeSeverity,
  buildAlgaeQueryUrl,
  fetchAlgaeSamples,
  isAlertWorthy,
  matchAlgaeToParks,
  microcystinValue,
  normalizeAlgae,
  type ArcgisQueryResponse,
} from "@/lib/ingest/algae";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeLongWeekends, normalizeNagerHolidays, type NagerHoliday, type NagerLongWeekend } from "@/lib/ingest/holidays";
import { manualAlertHash, nwsAlertHash, sha256Hex } from "@/lib/ingest/hash";
import type { UsgsReading } from "@/lib/types";

import ogcFixture from "./fixtures/usgs-latest.json";
import legacyFixture from "./fixtures/usgs-legacy.json";
import pointsFixture from "./fixtures/nws-points.json";
import forecastFixture from "./fixtures/nws-forecast.json";
import hourlyFixture from "./fixtures/nws-hourly.json";
import alertsFixture from "./fixtures/nws-alerts-fl.json";
import continuousFixture from "./fixtures/usgs-continuous.json";
import algaeFixture from "./fixtures/fdep-algae.json";
import nagerFixture from "./fixtures/nager-2026.json";
import noaaTempFixture from "./fixtures/noaa-water-temperature.json";
import noaaLevelFixture from "./fixtures/noaa-water-level.json";
import noaaPredictionsFixture from "./fixtures/noaa-predictions.json";
import noaaNoDataFixture from "./fixtures/noaa-error-nodata.json";
import noaaDatumErrorFixture from "./fixtures/noaa-error-datum.json";
import noaaStationsFixture from "./fixtures/noaa-stations-watertemp.json";
import longWeekendFixture from "./fixtures/nager-longweekend-2026.json";

const ogc = ogcFixture as unknown as OgcFeatureCollection;
const legacy = legacyFixture as unknown as LegacyResponse;
const points = pointsFixture as unknown as NwsPointsResponse;
const forecast = forecastFixture as unknown as NwsForecastResponse;
const hourly = hourlyFixture as unknown as NwsForecastResponse;
const alerts = (alertsFixture as unknown as { features: NwsAlertFeature[] }).features;
const continuous = continuousFixture as unknown as OgcFeatureCollection;
const algae = algaeFixture as unknown as ArcgisQueryResponse;
const sitesRdb = readFileSync(join(__dirname, "fixtures/usgs-sites-ichetucknee.rdb"), "utf8");
const nager = nagerFixture as unknown as NagerHoliday[];
const noaaTemp = noaaTempFixture as unknown as NoaaDataResponse;
const noaaLevel = noaaLevelFixture as unknown as NoaaDataResponse;
const noaaPredictions = noaaPredictionsFixture as unknown as NoaaPredictionsResponse;
const noaaNoData = noaaNoDataFixture as unknown as NoaaDataResponse;
const noaaDatumError = noaaDatumErrorFixture as unknown as NoaaDataResponse;
const noaaStations = noaaStationsFixture as unknown as { stations: { id: string; name: string; lat: number; lng: number }[] };
const longWeekends = longWeekendFixture as unknown as NagerLongWeekend[];

/** Fixtures were captured ~2026-09-19T05:41Z; "now" is an hour later. */
const NOW = new Date("2026-09-19T06:45:00Z");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// ---------------------------------------------------------------- USGS

describe("usgs normalizeOgc", () => {
  const readings = normalizeOgc(ogc, NOW);

  it("parses every feature and converts string values to numbers", () => {
    expect(readings).toHaveLength(21);
    const fortWhiteFlow = readings.find((r) => r.site === "02322500" && r.parameter === "00060");
    expect(fortWhiteFlow?.value).toBe(671);
    expect(typeof fortWhiteFlow?.value).toBe("number");
    const gage = readings.find((r) => r.site === "02322500" && r.parameter === "00065");
    expect(gage?.value).toBe(0.07);
  });

  it("strips the USGS- prefix and normalizes units", () => {
    expect(readings.every((r) => /^\d{8}$/.test(r.site))).toBe(true);
    expect(readings.find((r) => r.parameter === "00060")?.unit).toBe("ft3/s");
    expect(readings.find((r) => r.parameter === "00010")?.unit).toBe("degC");
    expect(readings.find((r) => r.parameter === "00065")?.unit).toBe("ft");
    expect(normalizeUnit("ft^3/s")).toBe("ft3/s");
    expect(normalizeUnit("deg C")).toBe("degC");
  });

  it("emits ISO UTC timestamps and provisional flags", () => {
    const r = readings.find((x) => x.site === "02322700" && x.parameter === "00060")!;
    expect(r.time).toBe("2026-09-19T04:45:00.000Z");
    expect(r.provisional).toBe(true);
  });

  it("flags readings older than 6 h as stale (Rainbow water temp from Nov 2025)", () => {
    const rainbowTemp = readings.filter((r) => r.site === "02313098" && r.parameter === "00010");
    expect(rainbowTemp.length).toBeGreaterThan(0);
    expect(rainbowTemp.every((r) => r.stale)).toBe(true);
    const rainbowFlow = readings.find((r) => r.site === "02313098" && r.parameter === "00060")!;
    expect(rainbowFlow.stale).toBe(false);
  });

  it("stale threshold is relative to `now`", () => {
    const later = normalizeOgc(ogc, new Date("2026-09-19T12:00:00Z"));
    expect(later.find((r) => r.site === "02322700" && r.parameter === "00060")?.stale).toBe(true);
  });

  it("skips unknown parameters and non-numeric values", () => {
    const junk: OgcFeatureCollection = {
      features: [
        { properties: { monitoring_location_id: "USGS-1", parameter_code: "00095", time: "2026-09-19T00:00:00Z", value: "450", unit_of_measure: "uS/cm" } },
        { properties: { monitoring_location_id: "USGS-1", parameter_code: "00060", time: "2026-09-19T00:00:00Z", value: "n/a", unit_of_measure: "ft^3/s" } },
        { properties: { monitoring_location_id: "USGS-1", parameter_code: "00060", time: "2026-09-19T00:00:00Z", value: null, unit_of_measure: "ft^3/s" } },
      ],
    };
    expect(normalizeOgc(junk, NOW)).toHaveLength(0);
  });
});

describe("usgs normalizeLegacy", () => {
  const readings = normalizeLegacy(legacy, NOW);

  it("parses WaterML-JSON and converts site-local offsets to UTC", () => {
    expect(readings.length).toBeGreaterThanOrEqual(20);
    const r = readings.find((x) => x.site === "02235500" && x.parameter === "00060")!;
    expect(r.value).toBe(174);
    expect(r.unit).toBe("ft3/s");
    expect(r.time).toBe("2026-09-19T04:15:00.000Z");
    expect(r.provisional).toBe(true);
  });

  it("drops noDataValue readings", () => {
    const junk: LegacyResponse = {
      value: {
        timeSeries: [
          {
            sourceInfo: { siteCode: [{ value: "02322700" }] },
            variable: { variableCode: [{ value: "00060" }], unit: { unitCode: "ft3/s" }, noDataValue: -999999 },
            values: [{ value: [{ value: "-999999", qualifiers: ["P"], dateTime: "2026-09-19T00:00:00.000-04:00" }] }],
          },
        ],
      },
    };
    expect(normalizeLegacy(junk, NOW)).toHaveLength(0);
  });
});

describe("usgs dedupe + site quirks", () => {
  it("keeps only the newest reading per (site, parameter)", () => {
    const raw = normalizeOgc(ogc, NOW);
    expect(raw.filter((r) => r.site === "02313098" && r.parameter === "00010")).toHaveLength(2);
    const deduped = dedupeNewest(raw);
    expect(deduped.filter((r) => r.site === "02313098" && r.parameter === "00010")).toHaveLength(1);
    const keys = new Set(deduped.map((r) => `${r.site}:${r.parameter}`));
    expect(keys.size).toBe(deduped.length);
  });

  it("prefers the newest when duplicates differ in time", () => {
    const a: UsgsReading = { site: "1", parameter: "00060", value: 1, unit: "ft3/s", time: "2026-09-19T00:00:00.000Z", stale: false, provisional: true };
    const b: UsgsReading = { ...a, value: 2, time: "2026-09-19T01:00:00.000Z" };
    expect(dedupeNewest([a, b])[0].value).toBe(2);
    expect(dedupeNewest([b, a])[0].value).toBe(2);
  });

  it("drops 00065 for 02322500 (arbitrary datum) and keeps 63160 instead", () => {
    const prepared = applySiteQuirks(dedupeNewest(normalizeOgc(ogc, NOW)));
    expect(prepared.find((r) => r.site === "02322500" && r.parameter === "00065")).toBeUndefined();
    expect(prepared.find((r) => r.site === "02322500" && r.parameter === "63160")?.value).toBe(20.13);
    // other sites keep their gage height
    expect(prepared.find((r) => r.site === "02322700" && r.parameter === "00065")?.value).toBe(14.83);
  });
});

describe("usgs flow flag + park payload", () => {
  it("flowFlagFor uses per-site baselines with a 1.5x threshold", () => {
    expect(flowFlagFor("02322500", 671)).toBe("normal");
    expect(flowFlagFor("02322500", 1800)).toBe("normal"); // exactly 1.5x is not "high"
    expect(flowFlagFor("02322500", 1801)).toBe("high");
    expect(flowFlagFor("02322400", 100)).toBe("unknown"); // Ginnie has no discharge baseline
    expect(flowFlagFor("02322700", null)).toBe("unknown");
  });

  const mk = (site: string, parameter: UsgsReading["parameter"], value: number, stale = false): UsgsReading => ({
    site,
    parameter,
    value,
    unit: parameter === "00060" ? "ft3/s" : parameter === "00010" ? "degC" : "ft",
    time: stale ? "2025-11-14T18:45:00.000Z" : "2026-09-19T05:15:00.000Z",
    stale,
    provisional: true,
  });

  it("merges the park's own gauge with its river gauge and uses the river discharge for Ginnie", () => {
    const readingsBySite = {
      "02322400": [mk("02322400", "00010", 22.6), mk("02322400", "00065", 20.79)],
      "02322500": [mk("02322500", "00060", 2000), mk("02322500", "63160", 20.13)],
    };
    const payload = buildUsgsPayloadForPark(
      { usgs_site_id: "02322400", river_gauge_site_id: "02322500", gauge_distance_km: 2.0 },
      readingsBySite,
      "2026-09-19T06:00:00.000Z",
    );
    expect(payload.source).toBe("usgs-ogc");
    expect(payload.readings).toHaveLength(4);
    expect(payload.flowFlag).toBe("high");
    expect(payload.flowNote).toContain("Santa Fe River near Fort White");
    expect(payload.flowNote).toContain("2.0 km away");
    expect(payload.flowNote).toContain("2,000 cfs");
  });

  it("is normal at typical flow and unknown when the only discharge is stale", () => {
    const normal = buildUsgsPayloadForPark({ usgs_site_id: "02322700", river_gauge_site_id: null }, { "02322700": [mk("02322700", "00060", 218)] }, NOW, "usgs-legacy");
    expect(normal.flowFlag).toBe("normal");
    expect(normal.source).toBe("usgs-legacy");
    expect(normal.fetchedAt).toBe(NOW.toISOString());

    const stale = buildUsgsPayloadForPark({ usgs_site_id: "02322700", river_gauge_site_id: null }, { "02322700": [mk("02322700", "00060", 218, true)] }, NOW);
    expect(stale.flowFlag).toBe("unknown");
    expect(stale.flowNote).toMatch(/more than 6 hours old/);
  });

  it("handles parks without any gauge", () => {
    const none = buildUsgsPayloadForPark({ usgs_site_id: null, river_gauge_site_id: null }, {}, NOW);
    expect(none.readings).toHaveLength(0);
    expect(none.flowFlag).toBe("unknown");
    expect(none.flowNote).toMatch(/no USGS gauge/);
  });
});

describe("usgs fetchUsgsLatest", () => {
  it("uses the OGC endpoint and groups readings by bare site id", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return jsonResponse(ogc);
    }) as typeof fetch;
    const bySite = await fetchUsgsLatest(["02322700", "USGS-02322500"], { fetchImpl, now: NOW, apiKey: "k" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("api.waterdata.usgs.gov");
    expect(calls[0]).toContain("monitoring_location_id=USGS-02322700%2CUSGS-02322500");
    expect(Object.keys(bySite)).toContain("02322700");
    expect(bySite["02322500"].find((r) => r.parameter === "00065")).toBeUndefined();
    expect(bySite["02322500"].find((r) => r.parameter === "63160")?.value).toBe(20.13);
  });

  it("falls back to the legacy IV service when the OGC call fails", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("api.waterdata.usgs.gov")) return jsonResponse({ error: "boom" }, 503);
      return jsonResponse(legacy);
    }) as typeof fetch;
    const result = await fetchUsgsLatestDetailed(["02322700"], { fetchImpl, now: NOW });
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain("waterservices.usgs.gov/nwis/iv");
    expect(result.source).toBe("usgs-legacy");
    expect(result.fallbackReason).toMatch(/HTTP 503/);
    expect(result.readingsBySite["02322700"].find((r) => r.parameter === "00060")?.value).toBe(218);
  });

  it("returns an empty map for no site ids without calling the network", async () => {
    const fetchImpl = (async () => {
      throw new Error("should not be called");
    }) as unknown as typeof fetch;
    expect(await fetchUsgsLatest([], { fetchImpl })).toEqual({});
  });
});

// ---------------------------------------------------------------- NWS

describe("nws helpers", () => {
  it("rounds coordinates to 4 dp (5 dp => 301 upstream)", () => {
    expect(roundCoord(29.98412)).toBe(29.9841);
    expect(roundCoord(-82.76234)).toBe(-82.7623);
  });

  it("extracts UGC codes from zone/county URLs or bare codes", () => {
    expect(ugcCode("https://api.weather.gov/zones/forecast/FLZ021")).toBe("FLZ021");
    expect(ugcCode("https://api.weather.gov/zones/county/FLC121")).toBe("FLC121");
    expect(ugcCode("flc083")).toBe("FLC083");
    expect(ugcCode("nonsense")).toBeNull();
    expect(ugcCode(null)).toBeNull();
  });

  it("sends the required headers", () => {
    const h = nwsHeaders("LakeLens-test/0.1 (test)");
    expect(h["User-Agent"]).toBe("LakeLens-test/0.1 (test)");
    expect(h.Accept).toBe("application/geo+json");
  });

  it("parses wind strings and weekday names", () => {
    expect(parseWindMph("0 to 8 mph")).toBe(8);
    expect(parseWindMph("1 mph")).toBe(1);
    expect(parseWindMph(null)).toBeNull();
    expect(weekdayShort("2026-09-19")).toBe("Sat");
  });

  it("parsePoints returns grid + zone/county codes", () => {
    const p = parsePoints(points);
    expect(p).toMatchObject({ gridId: "JAX", gridX: 25, gridY: 45, zone: "FLZ021", county: "FLC121", timeZone: "America/New_York" });
    expect(p.forecastHourly).toBe("https://api.weather.gov/gridpoints/JAX/25,45/forecast/hourly");
  });

  it("retries on 5xx and then succeeds; does not retry on 4xx", async () => {
    let n = 0;
    const flaky = (async () => (++n < 3 ? jsonResponse({}, 502) : jsonResponse({ ok: 1 }))) as typeof fetch;
    const out = await nwsFetchJson<{ ok: number }>("https://api.weather.gov/x", { fetchImpl: flaky, retryDelaysMs: [0, 0] });
    expect(out.ok).toBe(1);
    expect(n).toBe(3);

    let m = 0;
    const forbidden = (async () => {
      m++;
      return jsonResponse({}, 403);
    }) as typeof fetch;
    await expect(nwsFetchJson("https://api.weather.gov/x", { fetchImpl: forbidden, retryDelaysMs: [0, 0] })).rejects.toThrow(/403/);
    expect(m).toBe(1);
  });
});

describe("nws alert sweep area", () => {
  it("asks for every state the dataset covers, once each, in order", async () => {
    const seen: string[] = [];
    const spy = (async (url: string) => {
      seen.push(url);
      return jsonResponse({ features: [] });
    }) as unknown as typeof fetch;
    await fetchAlerts(["FL", "mn", "FL", "TX"], { fetchImpl: spy });
    expect(seen).toEqual(["https://api.weather.gov/alerts/active?area=FL,MN,TX"]);
  });

  it("drops malformed codes rather than sending them", () => {
    expect(normalizeAlertAreas(["FL", "Florida", "", null, undefined, "F", "M N", "mn"])).toEqual(["FL", "MN"]);
  });

  it("covering nowhere fetches nothing rather than every alert in the country", async () => {
    const spy = vi.fn();
    expect(await fetchAlerts([], { fetchImpl: spy as unknown as typeof fetch })).toEqual([]);
    expect(await fetchAlerts(["Florida"], { fetchImpl: spy as unknown as typeof fetch })).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("nws matchAlertsToPark (UGC county/zone)", () => {
  it("matches the Dunnellon flood warning to a Marion County park and not to Columbia County", () => {
    expect(alerts.length).toBeGreaterThan(0);
    const rainbow = matchAlertsToPark(alerts, { nws_zone: "FLZ043", nws_county: "FLC083" });
    expect(rainbow).toHaveLength(1);
    expect(rainbow[0].properties.event).toBe("Flood Warning");
    const ichetucknee = matchAlertsToPark(alerts, { nws_zone: "FLZ021", nws_county: "FLC121" });
    expect(ichetucknee).toHaveLength(0);
  });

  it("accepts full zone/county URLs as stored from /points", () => {
    const m = matchAlertsToPark(alerts, { nws_zone: null, nws_county: "https://api.weather.gov/zones/county/FLC017" });
    expect(m).toHaveLength(1);
  });

  it("ignores Cancel messages and parks without codes", () => {
    const cancelled: NwsAlertFeature[] = alerts.map((f) => ({ ...f, properties: { ...f.properties, messageType: "Cancel" } }));
    expect(matchAlertsToPark(cancelled, { nws_zone: null, nws_county: "FLC083" })).toHaveLength(0);
    expect(matchAlertsToPark(alerts, { nws_zone: null, nws_county: null })).toHaveLength(0);
  });
});

describe("nws normalizeNws", () => {
  const payload = normalizeNws(forecast, hourly, "2026-09-19T05:45:00.000Z");

  it("builds the WeatherPayload shape with provider nws", () => {
    expect(payload.provider).toBe("nws");
    expect(payload.fetchedAt).toBe("2026-09-19T05:45:00.000Z");
    expect(payload.current.tempF).toBe(75);
    expect(payload.current.shortForecast).toBe("Mostly Clear");
    expect(payload.current.humidity).toBe(84);
    expect(payload.current.windMph).toBe(1);
    expect(payload.current.icon).toContain("api.weather.gov/icons");
  });

  it("derives today's high/low/rain from the 12-h periods", () => {
    expect(payload.today.highF).toBe(93);
    expect(payload.today.lowF).toBe(70);
    expect(payload.today.rainProbMax).toBeGreaterThanOrEqual(18);
  });

  it("keeps 24 hourly entries with local-offset times and up to 7 daily entries", () => {
    expect(payload.hourly).toHaveLength(24);
    expect(payload.hourly[0].time).toBe("2026-09-19T01:00:00-04:00");
    expect(payload.daily.length).toBeGreaterThanOrEqual(6);
    expect(payload.daily.length).toBeLessThanOrEqual(7);
    expect(payload.daily[0]).toMatchObject({ date: "2026-09-19", name: "Sat", highF: 93 });
    expect(payload.daily[1].name).toBe("Sun");
  });

  it("tolerates a missing hourly response", () => {
    const p = normalizeNws(forecast, null, "2026-09-19T05:45:00.000Z");
    expect(p.hourly).toHaveLength(0);
    expect(p.current.tempF).toBe(70); // first 12-h period
    expect(p.today.highF).toBe(93);
  });
});


// ---------------------------------------------------------------- Holidays

describe("nager holidays", () => {
  it("keeps only global public holidays (observed federal dates) and dedupes by date", () => {
    const holidays = normalizeNagerHolidays(nager);
    expect(holidays).toHaveLength(10);
    expect(holidays.map((h) => h.date)).toEqual([
      "2026-01-01",
      "2026-01-19",
      "2026-02-16",
      "2026-05-25",
      "2026-06-19",
      "2026-07-03",
      "2026-09-07",
      "2026-11-11",
      "2026-11-26",
      "2026-12-25",
    ]);
    expect(holidays.find((h) => h.date === "2026-07-03")?.name).toBe("Independence Day");
    expect(holidays.some((h) => /Good Friday|Truman|Columbus/i.test(h.name))).toBe(false);
  });

  it("maps long weekends to start_date/end_date", () => {
    const lw = normalizeLongWeekends(longWeekends);
    expect(lw).toHaveLength(9);
    expect(lw[0]).toEqual({ start_date: "2026-01-01", end_date: "2026-01-04" });
    expect(lw.some((w) => w.start_date === "2026-09-05" && w.end_date === "2026-09-07")).toBe(true);
  });
});

// ---------------------------------------------------------------- hashes

describe("alert hashes", () => {
  it("are stable sha256 hex digests", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(manualAlertHash("p1", "closure", "  Swim area closed ")).toBe(manualAlertHash("p1", "closure", "Swim area closed"));
    expect(nwsAlertHash("p1", "urn:1", "h")).not.toBe(nwsAlertHash("p2", "urn:1", "h"));
  });
});

// ---------------------------------------------------------------- USGS batching + flow history

describe("usgs batching", () => {
  it("chunks site ids 40 per request and merges the results", async () => {
    const sites = Array.from({ length: 95 }, (_, i) => String(10000000 + i));
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      urls.push(url);
      const ids = new URL(url).searchParams.get("monitoring_location_id")!.split(",");
      return jsonResponse({
        features: ids.map((id) => ({
          properties: { monitoring_location_id: id, parameter_code: "00060", time: NOW.toISOString(), value: "1", unit_of_measure: "ft^3/s" },
        })),
      });
    };
    const result = await fetchUsgsLatestDetailed(sites, { fetchImpl, now: NOW });
    expect(urls).toHaveLength(3);
    expect(urls.map((u) => new URL(u).searchParams.get("monitoring_location_id")!.split(",").length)).toEqual([40, 40, 15]);
    expect(Object.keys(result.readingsBySite)).toHaveLength(95);
    expect(result.source).toBe("usgs-ogc");
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });
});

describe("usgs flow history (OGC continuous)", () => {
  it("normalises the continuous collection into ascending {t, v} points with the unit", () => {
    const { points, unit } = normalizeContinuous(continuous, "02322700", "00060");
    expect(points).toHaveLength(24);
    expect(unit).toBe("ft3/s");
    expect(points[0]).toEqual({ t: "2026-09-19T11:00:00.000Z", v: 218 });
    for (let i = 1; i < points.length; i++) expect(points[i].t > points[i - 1].t).toBe(true);
    expect(points.every((p) => typeof p.v === "number")).toBe(true);
  });

  it("drops other sites / parameters and non-numeric values and dedupes by time", () => {
    const junk: OgcFeatureCollection = {
      features: [
        { properties: { monitoring_location_id: "USGS-1", parameter_code: "00060", time: "2026-09-19T01:00:00Z", value: "5", unit_of_measure: "ft^3/s" } },
        { properties: { monitoring_location_id: "USGS-1", parameter_code: "00060", time: "2026-09-19T01:00:00Z", value: "6", unit_of_measure: "ft^3/s" } },
        { properties: { monitoring_location_id: "USGS-1", parameter_code: "00060", time: "2026-09-19T00:00:00Z", value: "Ice", unit_of_measure: "ft^3/s" } },
        { properties: { monitoring_location_id: "USGS-2", parameter_code: "00060", time: "2026-09-19T00:30:00Z", value: "7", unit_of_measure: "ft^3/s" } },
        { properties: { monitoring_location_id: "USGS-1", parameter_code: "00065", time: "2026-09-19T00:30:00Z", value: "1.2", unit_of_measure: "ft" } },
      ],
    };
    const { points } = normalizeContinuous(junk, "1", "00060");
    expect(points).toEqual([{ t: "2026-09-19T01:00:00.000Z", v: 6 }]);
  });

  it("builds the documented request and falls back from discharge to gage height", async () => {
    const url = buildContinuousUrl("02322700", "00060", new Date("2026-09-18T06:45:00Z"), NOW);
    expect(url).toContain("/collections/continuous/items?");
    expect(url).toContain("monitoring_location_id=USGS-02322700");
    expect(url).toContain("datetime=2026-09-18T06%3A45%3A00.000Z%2F2026-09-19T06%3A45%3A00.000Z");

    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const u = new URL(String(input));
      calls.push(u.searchParams.get("parameter_code")!);
      if (u.searchParams.get("parameter_code") === "00060") return jsonResponse({ features: [] });
      return jsonResponse({
        features: [{ properties: { monitoring_location_id: "USGS-02322400", parameter_code: "00065", time: "2026-09-19T05:00:00Z", value: "2.5", unit_of_measure: "ft" } }],
      });
    };
    const h = await fetchFlowHistory("02322400", 24, { fetchImpl, now: NOW });
    expect(calls).toEqual(["00060", "00065"]);
    expect(h).toEqual({ site: "02322400", parameter: "00065", unit: "ft", points: [{ t: "2026-09-19T05:00:00.000Z", v: 2.5 }] });
  });
});

// ---------------------------------------------------------------- Open-Meteo multi-location

// ---------------------------------------------------------------- gauge selection

describe("gauge selection (scripts/fetch-usgs-sites)", () => {
  const ich = { lat: 29.98389, lng: -82.76194 }; // Ichetucknee head spring
  const sites = parseRdbSites(sitesRdb);

  it("parses the RDB site table (comments, header and format rows skipped)", () => {
    expect(sites).toHaveLength(5);
    expect(sites.find((s) => s.site_no === "02322700")).toMatchObject({ site_tp_cd: "ST", station_nm: "ICHETUCKNEE R @ HWY27 NR HILDRETH, FL" });
    expect(sites.find((s) => s.site_no === "02322688")?.site_tp_cd).toBe("SP");
    expect(usgsSitesUrl(ich.lat, ich.lng)).toContain("bBox=-82.91194%2C29.83389%2C-82.61194%2C30.13389");
    expect(usgsSitesUrl(ich.lat, ich.lng)).toContain("siteType=SP%2CST");
  });

  it("picks the live spring <= 1 km and the nearest live discharge gauge <= 15 km", () => {
    const live: Record<string, SiteLiveness> = {
      "02322688": { discharge: false, level: true }, // Blue Hole spring, ~0.55 km
      "02322700": { discharge: true, level: true }, // Ichetucknee R @ Hwy 27, ~4.2 km
      "02322500": { discharge: true, level: true }, // Santa Fe nr Fort White, ~15.7 km (out of range)
    };
    const sel = selectGauges(ich, sites, live);
    expect(sel.usgs_site_id).toBe("02322688");
    expect(sel.river_gauge_site_id).toBe("02322700");
    expect(sel.gauge_distance_km).toBeCloseTo(4.2, 0);
    expect(Object.keys(sel.site_names).sort()).toEqual(["02322688", "02322700"]);
  });

  it("ignores dead gauges, prefers discharge over level-only, and never reuses the spring as the river gauge", () => {
    const none = selectGauges(ich, sites, {});
    expect(none).toEqual({ usgs_site_id: null, river_gauge_site_id: null, gauge_distance_km: null, site_names: {} });

    const levelOnlyNearer = selectGauges(ich, sites, {
      "02322700": { discharge: false, level: true }, // 4.2 km, level only
      "02322800": { discharge: true, level: true }, // ~12 km, discharge
    });
    expect(levelOnlyNearer.river_gauge_site_id).toBe("02322800");

    const springOnly = selectGauges(ich, sites, { "02322688": { discharge: true, level: false } });
    expect(springOnly.usgs_site_id).toBe("02322688");
    expect(springOnly.river_gauge_site_id).toBeNull();
    expect(springOnly.gauge_distance_km).toBeCloseTo(0.5, 0);
  });

  it("isLiveReading uses a 24 h window", () => {
    expect(isLiveReading("2026-09-19T00:00:00Z", NOW)).toBe(true);
    expect(isLiveReading("2026-09-17T00:00:00Z", NOW)).toBe(false);
    expect(isLiveReading("garbage", NOW)).toBe(false);
  });
});

// ---------------------------------------------------------------- FDEP algae

describe("fdep algae", () => {
  const ALGAE_NOW = new Date("2026-09-19T21:30:00Z"); // fixture captured 2026-09-19
  const samples = normalizeAlgae(algae);

  it("normalises ArcGIS features (epoch dates, coordinates, Yes/No/Pending domains)", () => {
    expect(samples).toHaveLength(98);
    const doctors = samples.find((s) => s.id === "0d087f81-3e80-4ea2-8170-ca23622c00cc")!;
    expect(doctors.sampledAt).toBe("2026-08-31T15:25:00.000Z");
    expect(doctors.lat).toBeCloseTo(30.1256, 3);
    expect(doctors.toxinPresent).toBe("yes");
    expect(doctors.bloomObserved).toBe(true);
    expect(doctors.county).toBe("Clay");
    expect(samples.some((s) => s.toxinPresent === "pending")).toBe(true);
    expect(buildAlgaeQueryUrl(new Date("2026-08-29T21:30:00Z"))).toContain("where=SampleDateTime+%3E%3D+TIMESTAMP+%272026-08-29+21%3A30%3A00%27");
  });

  it("severity and text follow toxin presence", () => {
    const doctors = samples.find((s) => s.id === "0d087f81-3e80-4ea2-8170-ca23622c00cc")!;
    expect(algaeSeverity(doctors)).toBe("Severe");
    expect(microcystinValue(doctors.microcystin)).toBe("0.33");
    expect(algaeAlertText(doctors, 1.8)).toMatch(/^FDEP algal bloom sample within 2 km on Aug 31: microcystin detected \(0\.33 µg\/L\)/);
    const pending = { ...doctors, toxinPresent: "pending" as const, microcystin: "Pending" };
    expect(algaeSeverity(pending)).toBe("Moderate");
    expect(algaeAlertText(pending, 0.4)).toContain("within 1 km");
    expect(algaeAlertText(pending, 0.4)).toContain("toxin results pending");
    const clean = { ...doctors, toxinPresent: "no" as const, bloomObserved: false };
    expect(isAlertWorthy(clean)).toBe(false);
    expect(algaeSeverity({ ...clean, bloomObserved: true })).toBe("Minor");
    expect(algaeAlertHash("p1", "s1")).not.toBe(algaeAlertHash("p2", "s1"));
  });

  it("matches samples to parks within 3 km and inside the 21-day window", () => {
    const doctors = samples.find((s) => s.id === "0d087f81-3e80-4ea2-8170-ca23622c00cc")!;
    const parks = [
      { id: "near", lat: doctors.lat + 0.01, lng: doctors.lng }, // ~1.1 km
      { id: "far", lat: doctors.lat + 0.1, lng: doctors.lng }, // ~11 km
      { id: "ichetucknee", lat: 29.98389, lng: -82.76194 },
    ];
    const matches = matchAlgaeToParks(samples, parks, ALGAE_NOW);
    expect(matches.some((m) => m.park.id === "near" && m.sample.id === doctors.id)).toBe(true);
    expect(matches.some((m) => m.park.id === "far")).toBe(false);
    expect(matches.find((m) => m.park.id === "near" && m.sample.id === doctors.id)?.distanceKm).toBeCloseTo(1.1, 1);
    // same sample 30 days later has aged out
    expect(matchAlgaeToParks(samples, parks, new Date("2026-10-19T21:30:00Z")).some((m) => m.sample.id === doctors.id)).toBe(false);
    // clean samples never match
    expect(matches.every((m) => isAlertWorthy(m.sample))).toBe(true);
  });

  it("fetchAlgaeSamples surfaces ArcGIS error envelopes", async () => {
    await expect(fetchAlgaeSamples({ fetchImpl: async () => jsonResponse({ error: { code: 400, message: "Invalid query" } }) })).rejects.toThrow(/Invalid query/);
    const ok = await fetchAlgaeSamples({ fetchImpl: async () => jsonResponse(algae), now: ALGAE_NOW });
    expect(ok).toHaveLength(98);
  });
});


// ---------------------------------------------------------------- NOAA CO-OPS

/**
 * The NOAA fixtures were captured live on 2026-09-19 at 23:24Z (Mayport 8720218, the station
 * station credits). NOAA_NOW is a few minutes later so the readings are fresh.
 */
const NOAA_NOW = new Date("2026-09-19T23:30:00Z");

describe("noaa url builders", () => {
  it("asks for the latest english/gmt json observation and always sends a datum for water_level", () => {
    const temp = new URL(buildDataUrl("8720218", "water_temperature"));
    expect(temp.searchParams.get("product")).toBe("water_temperature");
    expect(temp.searchParams.get("date")).toBe("latest");
    expect(temp.searchParams.get("units")).toBe("english");
    expect(temp.searchParams.get("time_zone")).toBe("gmt");
    expect(temp.searchParams.get("application")).toBe("LakeLens");
    // water_temperature must NOT carry a datum; water_level is rejected without one.
    expect(temp.searchParams.get("datum")).toBeNull();
    expect(new URL(buildDataUrl("8720218", "water_level")).searchParams.get("datum")).toBe("MLLW");
  });

  it("predictions use begin_date + range (date=latest is invalid there) and interval=hilo", () => {
    const url = new URL(buildPredictionsUrl("8720218", NOAA_NOW));
    expect(url.searchParams.get("product")).toBe("predictions");
    expect(url.searchParams.get("interval")).toBe("hilo");
    expect(url.searchParams.get("date")).toBeNull();
    expect(url.searchParams.get("begin_date")).toBe("20260919 23:30");
    expect(url.searchParams.get("range")).toBe("36");
    expect(noaaBeginDate(new Date("2026-01-02T03:04:00Z"))).toBe("20260102 03:04");
  });
});

describe("noaa parseNoaaTime", () => {
  it("reads NOAA's zone-less GMT stamps as UTC", () => {
    expect(parseNoaaTime("2026-09-19 23:24")).toBe("2026-09-19T23:24:00.000Z");
    expect(parseNoaaTime("2026-09-19 23:24:30")).toBe("2026-09-19T23:24:30.000Z");
    expect(parseNoaaTime("nonsense")).toBeNull();
  });
});

describe("noaa normalizeObservation", () => {
  it("reads the latest water temperature in degF", () => {
    const readings = normalizeObservation(noaaTemp, "8720218", "water_temp", NOAA_NOW);
    expect(readings).toHaveLength(1);
    expect(readings[0]).toMatchObject({ station: "8720218", parameter: "water_temp", unit: "degF", value: 84, stale: false });
    expect(readings[0].time).toBe("2026-09-19T23:24:00.000Z");
  });

  it("reads the latest water level in ft above MLLW", () => {
    const readings = normalizeObservation(noaaLevel, "8720218", "water_level", NOAA_NOW);
    expect(readings).toHaveLength(1);
    expect(readings[0]).toMatchObject({ parameter: "water_level", unit: "ft", stale: false });
    expect(readings[0].value).toBeCloseTo(3.028, 3);
  });

  it("flags a reading older than the 3 h stale window", () => {
    const later = new Date(NOAA_NOW.getTime() + NOAA_STALE_MS + 60e3);
    expect(normalizeObservation(noaaTemp, "8720218", "water_temp", later)[0].stale).toBe(true);
    // exactly at the threshold is still fresh
    const atEdge = new Date(Date.parse("2026-09-19T23:24:00.000Z") + NOAA_STALE_MS);
    expect(normalizeObservation(noaaTemp, "8720218", "water_temp", atEdge)[0].stale).toBe(false);
  });

  it("treats the 'no data' envelope (served with HTTP 200) as an empty result, not a failure", () => {
    expect(isNoDataMessage(extractError(noaaNoData)!)).toBe(true);
    expect(normalizeObservation(noaaNoData, "8725114", "water_temp", NOAA_NOW)).toEqual([]);
  });

  it("throws for any other error envelope, e.g. a missing datum", () => {
    expect(extractError(noaaDatumError)).toMatch(/Wrong Datum/);
    expect(() => normalizeObservation(noaaDatumError, "8720218", "water_level", NOAA_NOW)).toThrow(NoaaApiError);
    expect(() => normalizeObservation(noaaDatumError, "8720218", "water_level", NOAA_NOW)).toThrow(/Wrong Datum/);
    expect(extractError({ data: [] })).toBeNull();
  });
});

describe("noaa normalizeNextTide", () => {
  it("returns the first high/low strictly after now", () => {
    const tide = normalizeNextTide(noaaPredictions, "8720218", NOAA_NOW);
    expect(tide).toMatchObject({ type: "L", time: "2026-09-20T02:05:00.000Z" });
    expect(tide!.valueFt).toBeCloseTo(1.618, 3);
    // a moment after that low, the next high is returned instead
    const later = normalizeNextTide(noaaPredictions, "8720218", new Date("2026-09-20T02:06:00Z"));
    expect(later).toMatchObject({ type: "H", time: "2026-09-20T07:57:00.000Z" });
  });

  it("returns null past the end of the series and for the 'no data' envelope", () => {
    expect(normalizeNextTide(noaaPredictions, "8720218", new Date("2026-09-30T00:00:00Z"))).toBeNull();
    expect(normalizeNextTide(noaaNoData as unknown as NoaaPredictionsResponse, "8725114", NOAA_NOW)).toBeNull();
  });
});

describe("noaa fetchNoaaLatest", () => {
  const router = (calls: string[]) => async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("product=predictions")) return jsonResponse(noaaPredictions);
    if (url.includes("product=water_temperature")) return jsonResponse(noaaTemp);
    return jsonResponse(noaaLevel);
  };

  it("collects temp, level and the next tide for each station", async () => {
    const calls: string[] = [];
    const out = await fetchNoaaLatest(["8720218", "8720218"], { fetchImpl: router(calls) as typeof fetch, now: NOAA_NOW, gapMs: 0 });
    expect(Object.keys(out)).toEqual(["8720218"]); // de-duplicated
    expect(calls).toHaveLength(3);
    const station = out["8720218"];
    expect(station.stationName).toBe("Mayport (Bar Pilots Dock)");
    expect(station.readings.map((r) => r.parameter)).toEqual(["water_level", "water_temp"]);
    expect(station.nextTide?.type).toBe("L");
    expect(station.errors).toEqual([]);
  });

  it("skips products a station does not publish when capabilities say so", async () => {
    const calls: string[] = [];
    const out = await fetchNoaaLatest(["8720030"], {
      fetchImpl: router(calls) as typeof fetch,
      now: NOAA_NOW,
      gapMs: 0,
      capabilities: { "8720030": { water_temp: false, water_level: true } },
    });
    expect(calls.some((c) => c.includes("product=water_temperature"))).toBe(false);
    expect(out["8720030"].readings.map((r) => r.parameter)).toEqual(["water_level"]);
  });

  it("records a per-product failure instead of throwing, and retries a 5xx once", async () => {
    let attempts = 0;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("product=water_temperature")) {
        attempts++;
        return attempts === 1 ? jsonResponse({ oops: true }, 503) : jsonResponse(noaaTemp);
      }
      if (url.includes("product=water_level")) return jsonResponse({ boom: true }, 502);
      return jsonResponse(noaaPredictions);
    }) as typeof fetch;
    const out = await fetchNoaaLatest(["8720218"], { fetchImpl, now: NOAA_NOW, gapMs: 0 });
    expect(attempts).toBe(2); // one retry, then success
    expect(out["8720218"].readings.map((r) => r.parameter)).toEqual(["water_temp"]);
    expect(out["8720218"].errors.join(" ")).toMatch(/water_level: HTTP 502/);
    expect(out["8720218"].nextTide).not.toBeNull();
  });
});

describe("noaa buildNoaaPayloadForPark", () => {
  const results = {
    "8720218": {
      stationId: "8720218",
      stationName: "Mayport (Bar Pilots Dock)",
      readings: [
        ...normalizeObservation(noaaTemp, "8720218", "water_temp", NOAA_NOW),
        ...normalizeObservation(noaaLevel, "8720218", "water_level", NOAA_NOW),
      ],
      nextTide: normalizeNextTide(noaaPredictions, "8720218", NOAA_NOW),
      errors: [],
    },
  };

  it("builds the payload the UI attributes to 'NOAA station #8720218'", () => {
    const payload = buildNoaaPayloadForPark({ noaa_station_id: "8720218", noaa_distance_km: 2.4 }, results, NOAA_NOW)!;
    expect(payload.source).toBe("noaa");
    expect(payload.stationId).toBe("8720218");
    expect(payload.stationName).toBe("Mayport (Bar Pilots Dock)");
    expect(payload.distanceKm).toBe(2.4);
    expect(payload.readings).toHaveLength(2);
    expect(payload.nextTide?.type).toBe("L");
    expect(payload.note).toMatch(/84°F/);
  });

  it("never invents a value: a silent station yields an empty payload with a plain note", () => {
    const payload = buildNoaaPayloadForPark({ noaa_station_id: "8726607" }, results, NOAA_NOW)!;
    expect(payload.readings).toEqual([]);
    expect(payload.nextTide).toBeNull();
    expect(payload.note).toMatch(/No live reading/i);
  });

  it("returns null for a park with no station", () => {
    expect(buildNoaaPayloadForPark({ noaa_station_id: null }, results, NOAA_NOW)).toBeNull();
  });

  it("does not report a stale reading as current", () => {
    const old = new Date(NOAA_NOW.getTime() + NOAA_STALE_MS + 60e3);
    const stale = {
      "8720218": {
        ...results["8720218"],
        readings: [
          ...normalizeObservation(noaaTemp, "8720218", "water_temp", old),
          ...normalizeObservation(noaaLevel, "8720218", "water_level", old),
        ],
      },
    };
    const payload = buildNoaaPayloadForPark({ noaa_station_id: "8720218" }, stale, old)!;
    expect(payload.readings.every((r) => r.stale)).toBe(true);
    expect(payload.note).toMatch(/more than 3 hours old/);
  });
});

describe("noaa station selection (scripts/fetch-noaa-stations.ts rules)", () => {
  /** Same ranking the script applies: in-range, verified, water temperature preferred, then nearest. */
  function pick(park: { lat: number; lng: number }, verified: Record<string, { temp: boolean; level: boolean }>, maxKm: number) {
    const ranked = noaaStations.stations
      .map((s) => ({ s, km: haversineKm(park.lat, park.lng, s.lat, s.lng), v: verified[s.id] }))
      .filter((c) => c.km <= maxKm && c.v && (c.v.temp || c.v.level))
      .sort((a, b) => a.km - b.km);
    return ranked.find((c) => c.v!.temp) ?? ranked[0] ?? null;
  }

  // Little Talbot Island beach, just north of the St Johns river mouth.
  const beach = { lat: 30.44, lng: -81.42 };

  it("picks the nearest station that actually returns data", () => {
    const verified = { "8720218": { temp: true, level: true }, "8720219": { temp: true, level: true } };
    expect(pick(beach, verified, 40)!.s.id).toBe("8720218"); // Mayport, ~4.7 km
  });

  it("skips a nearer station that returned nothing", () => {
    const verified = { "8720218": { temp: false, level: false }, "8720219": { temp: true, level: true } };
    expect(pick(beach, verified, 40)!.s.id).toBe("8720219"); // Dames Point instead
  });

  it("prefers water temperature over a nearer level-only station", () => {
    const verified = { "8720218": { temp: false, level: true }, "8720219": { temp: true, level: true } };
    expect(pick(beach, verified, 40)!.s.id).toBe("8720219");
  });

  it("returns nothing when every station is out of range", () => {
    const verified = { "8720218": { temp: true, level: true } };
    expect(pick(beach, verified, 1)).toBeNull();
  });
});
