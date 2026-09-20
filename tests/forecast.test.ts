/**
 * Forecast assembly: EPA UV parsing, the heat index, gridpoint interval expansion and the
 * columnar hourly round trip. No network: fetch is injected.
 */
import { describe, expect, it, vi } from "vitest";
import { buildUvPayload, buildUvUrl, parseEpaDateTime, parseUvHourly, uvBand, fetchUvForPark } from "@/lib/ingest/uv";
import { buildHourlyColumnar, expandGridSeries, feelsLikeF } from "@/lib/ingest/forecast";
import type { WeatherPayload } from "@/lib/types";

const EPA_ROWS = [
  { ORDER: 1, CITY: "Branford", DATE_TIME: "Sep/20/2026 07 AM", UV_VALUE: 0 },
  { ORDER: 2, CITY: "Branford", DATE_TIME: "Sep/20/2026 11 AM", UV_VALUE: 4 },
  { ORDER: 3, CITY: "Branford", DATE_TIME: "Sep/20/2026 01 PM", UV_VALUE: 8 },
  { ORDER: 4, CITY: "Branford", DATE_TIME: "Sep/20/2026 12 PM", UV_VALUE: 7 },
  { ORDER: 5, CITY: "Branford", DATE_TIME: "Sep/20/2026 12 AM", UV_VALUE: 0 },
];

describe("EPA UV", () => {
  it("builds a coordinate URL, since EPA needs no ZIP lookup", () => {
    expect(buildUvUrl(29.98412, -82.76119)).toBe(
      "https://data.epa.gov/efservice/getEnvirofactsUVHOURLY/LATITUDE/29.9841/LONGITUDE/-82.7612/JSON",
    );
  });

  it("parses EPA's local wall-clock format including both noon and midnight", () => {
    expect(parseEpaDateTime("Sep/20/2026 07 AM")).toEqual({ date: "2026-09-20", hour: 7 });
    expect(parseEpaDateTime("Sep/20/2026 12 PM")).toEqual({ date: "2026-09-20", hour: 12 });
    expect(parseEpaDateTime("Sep/20/2026 12 AM")).toEqual({ date: "2026-09-20", hour: 0 });
    expect(parseEpaDateTime("Dec/01/2026 11 PM")).toEqual({ date: "2026-12-01", hour: 23 });
  });

  it("returns null for junk instead of poisoning the series", () => {
    expect(parseEpaDateTime("not a date")).toBeNull();
    expect(parseEpaDateTime(null)).toBeNull();
    expect(parseEpaDateTime("2026-09-20T07:00:00Z")).toBeNull();
  });

  it("sorts the series by hour and drops unparseable rows", () => {
    const hours = parseUvHourly([...EPA_ROWS, { DATE_TIME: "bad", UV_VALUE: 99 }]);
    expect(hours.map((h) => h.hour)).toEqual([0, 7, 11, 12, 13]);
    expect(parseUvHourly("not an array")).toEqual([]);
  });

  it("takes today's index as the peak of the hourly series", () => {
    const payload = buildUvPayload(parseUvHourly(EPA_ROWS), { localHour: 11 }, "Branford");
    expect(payload.peak).toBe(8);
    expect(payload.peakHour).toBe(13);
    expect(payload.now).toBe(4);
    expect(payload.city).toBe("Branford");
  });

  it("is honest when the series is empty", () => {
    const payload = buildUvPayload([], {});
    expect(payload).toMatchObject({ peak: null, peakHour: null, now: null, hours: [] });
  });

  it("uvBand follows the WHO thresholds", () => {
    expect([0, 3, 6, 8, 11].map(uvBand)).toEqual(["low", "moderate", "high", "very-high", "extreme"]);
  });

  it("throws on a failed fetch so the caller can record the outage", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status: 503 }));
    await expect(fetchUvForPark(29.9, -82.7, { fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toThrow(/503/);
  });
});

describe("feelsLikeF", () => {
  it("uses the heat index when warm and humid, which is the Florida case", () => {
    // 91 degF at 70 % humidity is well above the air temperature.
    expect(feelsLikeF(91, 70, 5)).toBeGreaterThan(100);
  });

  it("leaves mild weather alone", () => {
    expect(feelsLikeF(75, 60, 5)).toBe(75);
    // Warm but dry: below the 40 % humidity threshold, so no heat index.
    expect(feelsLikeF(85, 20, 5)).toBe(85);
  });

  it("uses wind chill when cold and breezy", () => {
    expect(feelsLikeF(40, 50, 15)).toBeLessThan(40);
    expect(feelsLikeF(40, 50, 1)).toBe(40);
  });
});

describe("gridpoint series", () => {
  it("expands an ISO 8601 interval into one value per hour", () => {
    const map = expandGridSeries({
      values: [{ validTime: "2026-09-20T03:00:00+00:00/PT3H", value: 40 }],
    });
    expect([...map.keys()]).toEqual(["2026-09-20T03", "2026-09-20T04", "2026-09-20T05"]);
    expect(map.get("2026-09-20T04")).toBe(40);
  });

  it("skips nulls and unparseable entries", () => {
    const map = expandGridSeries({
      values: [
        { validTime: "2026-09-20T03:00:00+00:00/PT1H", value: null },
        { validTime: "garbage", value: 10 },
      ],
    });
    expect(map.size).toBe(0);
    expect(expandGridSeries(undefined).size).toBe(0);
  });
});

function weather(hours: { time: string; tempF: number | null; rainProb: number | null }[]): WeatherPayload {
  return {
    provider: "nws",
    fetchedAt: "2026-09-20T12:00:00.000Z",
    current: { tempF: 88, shortForecast: "Sunny", windMph: 6, humidity: 70, icon: null },
    today: { highF: 91, lowF: 72, rainProbMax: 20 },
    hourly: hours.map((h) => ({ ...h, shortForecast: "Sunny" })),
    daily: [],
  };
}

describe("columnar hourly", () => {
  it("zips NWS hours, gridpoint extras and UV into parallel arrays", () => {
    const w = weather([
      { time: "2026-09-20T08:00:00-04:00", tempF: 80, rainProb: 10 },
      { time: "2026-09-20T09:00:00-04:00", tempF: 83, rainProb: 20 },
    ]);
    const extras = {
      issuedAt: "2026-09-20T11:00:00Z",
      thunder: expandGridSeries({ values: [{ validTime: "2026-09-20T12:00:00+00:00/PT2H", value: 30 }] }),
      apparentF: expandGridSeries({ values: [{ validTime: "2026-09-20T12:00:00+00:00/PT1H", value: 35 }] }),
    };
    const uv = buildUvPayload(parseUvHourly([{ DATE_TIME: "Sep/20/2026 08 AM", UV_VALUE: 3 }]), {});

    const cols = buildHourlyColumnar(w, extras, uv)!;
    expect(cols.n).toBe(2);
    expect(cols.temp_f).toEqual([80, 83]);
    expect(cols.pop).toEqual([10, 20]);
    // 08:00-04:00 is 12:00 UTC, so both gridpoint series line up on the first hour.
    expect(cols.thunder).toEqual([30, 30]);
    // UV is matched by LOCAL hour, because EPA has no offset to match on.
    expect(cols.uv).toEqual([3, null]);
    expect(cols.start_utc).toBe("2026-09-20T12:00:00.000Z");
  });

  it("computes feels-like itself when the gridpoint has none", () => {
    const w = weather([{ time: "2026-09-20T08:00:00-04:00", tempF: 91, rainProb: 0 }]);
    const cols = buildHourlyColumnar(w, null, null)!;
    expect(cols.apparent_f[0]).toBeGreaterThan(91);
    expect(cols.uv).toEqual([null]);
  });

  it("returns null when there are no hours to describe", () => {
    expect(buildHourlyColumnar(weather([]), null, null)).toBeNull();
  });
});
