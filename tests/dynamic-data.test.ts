/**
 * Tests for the two ingestion jobs that replaced committed JSON caches:
 * Overpass parking (data/osm-cache/overpass-parking.json) and station assignment
 * (data/gauges.json, data/noaa_stations.json). No network: fetch is injected.
 */
import { describe, expect, it, vi } from "vitest";
import {
  MAX_LOTS_PER_PARK,
  PARKING_RADIUS_M,
  buildParkingQuery,
  describeFee,
  describeNotes,
  fetchParkingElements,
  groupParkingByPark,
  type OverpassElement,
} from "../supabase/functions/_shared/overpass";
import { NOAA_BEACH_MAX_KM, NOAA_MAX_KM, nearestStation, parseStations } from "../supabase/functions/_shared/stations";
import { WATER_QUALITY_MATCH_KM, nearestSample, waterQualityFor } from "../supabase/functions/_shared/algae";
import { abundanceLevel, normalizeHab, redTideForPark } from "../supabase/functions/_shared/redtide";
import { beachWaterFor, levelFromCfu, parseResultSet, parseRow, toIsoDate } from "../supabase/functions/_shared/fdoh";
import { toCalendarEvents } from "@/lib/queries";

const ICHETUCKNEE = { id: "p1", slug: "ichetucknee", name: "Ichetucknee", lat: 29.9841, lng: -82.7612 };
const RAINBOW = { id: "p2", slug: "rainbow", name: "Rainbow", lat: 29.1025, lng: -82.4375 };

function node(id: number, lat: number, lng: number, tags: Record<string, string> = {}): OverpassElement {
  return { type: "node", id, lat, lon: lng, tags: { amenity: "parking", ...tags } };
}

describe("overpass parking", () => {
  it("builds one around-clause per park", () => {
    const q = buildParkingQuery([ICHETUCKNEE, RAINBOW], 1000);
    expect(q).toContain('nwr["amenity"="parking"](around:1000,29.98410,-82.76120);');
    expect(q).toContain('nwr["amenity"="parking"](around:1000,29.10250,-82.43750);');
    expect(q).toContain("out center;");
  });

  it("assigns each lot to the nearest park and ignores ones out of range", () => {
    const rows = groupParkingByPark(
      { elements: [node(1, 29.9845, -82.7615), node(2, 29.1028, -82.4378), node(3, 27.0, -80.0)] },
      [ICHETUCKNEE, RAINBOW],
    );
    expect(rows.map((r) => r.park_id).sort()).toEqual(["p1", "p2"]);
    expect(rows.find((r) => r.park_id === "p1")?.osm_ref).toBe("node/1");
  });

  it("a lot inside two parks' circles is claimed once, by the nearer park", () => {
    const a = { ...ICHETUCKNEE, id: "near" };
    const b = { ...ICHETUCKNEE, id: "far", lat: 29.9900 };
    const rows = groupParkingByPark({ elements: [node(1, 29.9841, -82.7612)] }, [b, a]);
    expect(rows).toHaveLength(1);
    expect(rows[0].park_id).toBe("near");
  });

  it("drops parking that is not public, and roadway parking", () => {
    const rows = groupParkingByPark(
      {
        elements: [
          node(1, 29.9842, -82.7613, { access: "private" }),
          node(2, 29.9842, -82.7613, { access: "customers" }),
          node(3, 29.9842, -82.7613, { parking: "street_side" }),
          node(4, 29.9842, -82.7613, { name: "Keep me" }),
        ],
      },
      [ICHETUCKNEE],
    );
    expect(rows.map((r) => r.name)).toEqual(["Keep me"]);
  });

  it("keeps only the nearest MAX_LOTS_PER_PARK lots", () => {
    const many = Array.from({ length: MAX_LOTS_PER_PARK + 4 }, (_, i) => node(i + 1, 29.9841 + i * 0.0005, -82.7612));
    const rows = groupParkingByPark({ elements: many }, [ICHETUCKNEE]);
    expect(rows).toHaveLength(MAX_LOTS_PER_PARK);
    // Nearest first: node/1 sits exactly on the park centre.
    expect(rows[0].osm_ref).toBe("node/1");
  });

  it("reads fee, capacity, ada spaces and notes from OSM tags", () => {
    const [row] = groupParkingByPark(
      {
        elements: [
          node(1, 29.9842, -82.7613, {
            name: "North lot",
            fee: "yes",
            charge: "$6 per vehicle",
            capacity: "120",
            "capacity:disabled": "4",
            surface: "crushed_limestone",
          }),
        ],
      },
      [ICHETUCKNEE],
    );
    expect(row).toMatchObject({ name: "North lot", fee: "$6 per vehicle", capacity: 120, ada_spaces: 4, source: "osm" });
    expect(row.notes).toContain("crushed limestone surface");
  });

  it("describeFee / describeNotes stay quiet when OSM says nothing", () => {
    expect(describeFee({})).toBeNull();
    expect(describeFee({ fee: "no" })).toBe("Free");
    expect(describeFee({ fee: "yes" })).toBe("Paid");
    expect(describeNotes({})).toBeNull();
  });

  it("merges chunks, dedupes by osm id and reports a partial sweep", async () => {
    const parks = Array.from({ length: 5 }, (_, i) => ({ lat: 29 + i, lng: -82 }));
    const fetchImpl = vi
      .fn()
      // chunk 1 succeeds
      .mockResolvedValueOnce(new Response(JSON.stringify({ elements: [node(1, 29, -82), node(2, 29, -82)] }), { status: 200 }))
      // chunk 2 fails on every mirror
      .mockResolvedValue(new Response("busy", { status: 406 }));

    const res = await fetchParkingElements(parks, { fetchImpl: fetchImpl as unknown as typeof fetch, chunkSize: 3 });
    expect(res.elements?.length).toBe(2);
    expect(res.partial).toBe(true);
    expect(res.failures?.length).toBeGreaterThan(0);
  });

  it("throws only when every chunk fails, so a total outage never looks like 'no parking'", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("busy", { status: 406 }));
    await expect(
      fetchParkingElements([{ lat: 29, lng: -82 }], { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/overpass/i);
  });

  it("uses a radius that excludes town-centre parking", () => {
    expect(PARKING_RADIUS_M).toBeLessThanOrEqual(1000);
  });
});

describe("station assignment", () => {
  const stations = { stations: [
    { id: "8720218", name: "Mayport", lat: 30.3982, lng: -81.4279, state: "FL" },
    { id: "9999999", name: "Far away", lat: 42.0, lng: -71.0, state: "MA" },
    { id: "bad", name: "No coords", state: "FL" },
  ] };

  it("keeps regional stations with coordinates and drops the rest", () => {
    const parsed = parseStations(stations);
    expect(parsed.map((s) => s.id)).toEqual(["8720218"]);
  });

  it("picks the nearest station inside the park type's limit", () => {
    const parsed = parseStations(stations);
    const near = nearestStation({ lat: 30.4, lng: -81.43, type: "beach" }, parsed);
    expect(near?.station.id).toBe("8720218");
    expect(near?.km).toBeLessThan(2);
  });

  it("refuses a station that is too far away rather than inventing coverage", () => {
    const parsed = parseStations(stations);
    // Inland spring, hundreds of km from the only station.
    expect(nearestStation({ lat: 29.98, lng: -82.76, type: "spring" }, parsed)).toBeNull();
  });

  it("beaches tolerate a more distant station than inland parks", () => {
    expect(NOAA_BEACH_MAX_KM).toBeGreaterThan(NOAA_MAX_KM);
  });
});

describe("calendar events from the database", () => {
  it("maps rows and defaults the weight", () => {
    expect(
      toCalendarEvents([
        { name: "Spring break", start_date: "2027-03-13", end_date: "2027-03-21", weight: 2 },
        { name: "Summer", start_date: "2026-06-01", end_date: "2026-08-10", weight: null },
      ]),
    ).toEqual([
      { start: "2027-03-13", end: "2027-03-21", name: "Spring break", weight: 2 },
      { start: "2026-06-01", end: "2026-08-10", name: "Summer", weight: 1 },
    ]);
  });

  it("drops rows the prediction could not use", () => {
    expect(
      toCalendarEvents([
        { name: null, start_date: "2026-06-01", end_date: "2026-06-02", weight: 1 },
        { name: "Bad date", start_date: "June 1", end_date: "2026-06-02", weight: 1 },
        { name: "Missing end", start_date: "2026-06-01", end_date: null, weight: 1 },
      ]),
    ).toEqual([]);
  });
});

describe("water quality reading", () => {
  const sample = (over: Partial<import("../supabase/functions/_shared/algae").AlgaeSample> = {}) => ({
    id: "s1",
    sampledAt: "2026-09-17T12:00:00.000Z",
    lat: 29.9841,
    lng: -82.7612,
    county: "Columbia",
    location: "Ichetucknee Headspring",
    bloomObserved: false,
    toxinPresent: "no" as const,
    microcystin: "not detected",
    otherToxin: null,
    cyanobacteriaDominant: "no" as const,
    algalId: null,
    ...over,
  });

  it("finds the closest sample inside the radius and reports the distance", () => {
    const near = sample();
    const far = sample({ id: "s2", lat: 27, lng: -80 });
    const match = nearestSample([far, near], { lat: 29.9841, lng: -82.7612 }, WATER_QUALITY_MATCH_KM);
    expect(match?.sample.id).toBe("s1");
    expect(match?.distanceKm).toBe(0);
  });

  it("returns null when nothing is in range, so the tile hides itself", () => {
    expect(nearestSample([sample({ lat: 27, lng: -80 })], { lat: 29.9841, lng: -82.7612 })).toBeNull();
    expect(waterQualityFor(null)).toBeNull();
  });

  it("a clean sample reads Clear", () => {
    expect(waterQualityFor({ sample: sample(), distanceKm: 4 })).toMatchObject({ level: "clear", label: "Clear", distanceKm: 4 });
  });

  it("a detected toxin or an observed bloom reads Avoid", () => {
    expect(waterQualityFor({ sample: sample({ toxinPresent: "yes" }), distanceKm: 1 })?.level).toBe("avoid");
    expect(waterQualityFor({ sample: sample({ bloomObserved: true }), distanceKm: 1 })?.level).toBe("avoid");
  });

  it("a pending result is never Clear, because the sample was taken for a reason", () => {
    expect(waterQualityFor({ sample: sample({ toxinPresent: "pending" }), distanceKm: 1 })?.level).toBe("caution");
    expect(waterQualityFor({ sample: sample({ cyanobacteriaDominant: "yes" }), distanceKm: 1 })?.level).toBe("caution");
  });

  it("uses a wider radius than the alert rule, which matched no parks at 3 km", () => {
    expect(WATER_QUALITY_MATCH_KM).toBeGreaterThan(3);
  });
});

describe("red tide (FWC)", () => {
  const s = (over: Partial<import("../supabase/functions/_shared/redtide").HabSample> = {}) => ({
    id: "1",
    sampledAt: "2026-09-19T00:00:00.000Z",
    lat: 27.21,
    lng: -82.51,
    county: "Sarasota",
    location: "Midnight Pass",
    abundance: "not present/background (0-1,000)",
    level: abundanceLevel("not present/background (0-1,000)"),
    ...over,
  });
  const NOW = new Date("2026-09-20T00:00:00.000Z");
  const beach = { lat: 27.21, lng: -82.51, type: "beach" };

  it("reads FWC's abundance wording, including the cases that contain each other", () => {
    expect(abundanceLevel("not present/background (0-1,000)")).toBe("none");
    expect(abundanceLevel("very low (1,000-10,000)")).toBe("very-low");
    expect(abundanceLevel("low (10,000-100,000)")).toBe("low");
    expect(abundanceLevel("medium (100,000-1,000,000)")).toBe("medium");
    expect(abundanceLevel("high (>1,000,000)")).toBe("high");
  });

  it("never reports red tide for inland water", () => {
    expect(redTideForPark([s()], { lat: 27.21, lng: -82.51, type: "spring" }, NOW)).toBeNull();
    expect(redTideForPark([s()], { lat: 27.21, lng: -82.51, type: "lake" }, NOW)).toBeNull();
  });

  it("takes the worst level in range, not the nearest sample", () => {
    const clean = s({ id: "clean" });
    const bloom = s({ id: "bloom", lat: 27.3, lng: -82.5, abundance: "high (>1,000,000)", level: "high" });
    const out = redTideForPark([clean, bloom], beach, NOW);
    expect(out?.level).toBe("high");
    expect(out?.sampleCount).toBe(2);
  });

  it("ignores samples that are too old or too far", () => {
    expect(redTideForPark([s({ sampledAt: "2026-08-01T00:00:00.000Z" })], beach, NOW)).toBeNull();
    expect(redTideForPark([s({ lat: 30, lng: -85 })], beach, NOW)).toBeNull();
  });

  it("normalizes ArcGIS features and drops rows with no coordinates", () => {
    const parsed = normalizeHab({
      features: [
        { attributes: { OBJECTID: 1, LATITUDE: 27.2, LONGITUDE: -82.5, SAMPLE_DATE: 1789185600000, Abundance: "high (x)", LOCATION: "A" } },
        { attributes: { OBJECTID: 2, Abundance: "high (x)" } },
      ],
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0].level).toBe("high");
  });
});

describe("beach water quality (FDOH)", () => {
  const NOW = new Date("2026-09-20T00:00:00.000Z");
  const beach = { lat: 27.98, lng: -82.83, type: "beach" };
  const site = (over: Partial<import("../supabase/functions/_shared/fdoh").WqSample> = {}) => ({
    stationId: "Pinellas|CLEARWATER BEACH",
    stationName: "CLEARWATER BEACH",
    county: "Pinellas",
    lat: 27.984,
    lng: -82.829,
    date: "2026-09-14",
    period: "1305",
    valueCfu: 4,
    advisory: false,
    level: levelFromCfu(4),
    ...over,
  });

  it("uses FDOH's own thresholds", () => {
    expect(levelFromCfu(35.4)).toBe("good");
    expect(levelFromCfu(35.5)).toBe("caution");
    expect(levelFromCfu(70.4)).toBe("caution");
    expect(levelFromCfu(70.5)).toBe("advisory");
  });

  it("parses the US date format zero-padded, so dates sort lexicographically", () => {
    expect(toIsoDate("9/14/2026")).toBe("2026-09-14");
    expect(toIsoDate("12/1/2026")).toBe("2026-12-01");
    expect(toIsoDate("not a date")).toBeNull();
  });

  it("never reports beach water quality for inland water", () => {
    expect(beachWaterFor([site()], { lat: 27.98, lng: -82.83, type: "spring" }, NOW)).toBeNull();
  });

  it("takes the worst reading in range", () => {
    const clean = site();
    const bad = site({ stationId: "b", valueCfu: 300, level: "advisory", advisory: true, lat: 27.99, lng: -82.84 });
    expect(beachWaterFor([clean, bad], beach, NOW)?.level).toBe("advisory");
  });

  it("drops readings older than the posting cycle allows", () => {
    expect(beachWaterFor([site({ date: "2026-07-01" })], beach, NOW)).toBeNull();
  });

  it("parses a Caspio row, taking the enterococcus value from the script variable", () => {
    const row = [
      '<tr class="cbResultSetDataRow">',
      "<span>Period:</span> 1305",
      "<span>Location:</span> CLEARWATER BEACH - PIER 60",
      "<span>Date:</span> 9/14/2026",
      "<span>Advisory:</span> No",
      '<div id="Latitude:x" >27.973913</div>',
      '<div id="Longitude:x" >-82.830386</div>',
      "<script>var enterococcus = '4';</script>",
    ].join("\n");
    const parsed = parseRow(row, "Pinellas");
    expect(parsed).toMatchObject({ stationName: "CLEARWATER BEACH - PIER 60", date: "2026-09-14", valueCfu: 4, level: "good", advisory: false });
  });

  it("treats a high reading as an advisory even when FDOH's column says No", () => {
    const row = [
      '<tr class="cbResultSetDataRow">',
      "<span>Location:</span> SOUTH BEACH",
      "<span>Date:</span> 9/8/2026",
      "<span>Advisory:</span> No",
      '<div id="Latitude:x" >24.546</div>',
      '<div id="Longitude:x" >-81.804</div>',
      "<script>var enterococcus = '521';</script>",
    ].join("\n");
    expect(parseRow(row, "Monroe")).toMatchObject({ level: "advisory", advisory: true });
  });

  it("drops a No Result row so the previous reading survives", () => {
    const row = [
      '<tr class="cbResultSetDataRow">',
      "<span>Location:</span> SOUTH BEACH",
      "<span>Date:</span> 9/8/2026",
      "<script>var enterococcus = '';</script>",
    ].join("\n");
    expect(parseRow(row, "Monroe")).toBeNull();
  });

  it("rejects coordinates outside Florida", () => {
    const row = [
      '<tr class="cbResultSetDataRow">',
      "<span>Location:</span> NOWHERE",
      "<span>Date:</span> 9/8/2026",
      '<div id="Latitude:x" >48.1</div>',
      '<div id="Longitude:x" >-122.3</div>',
      "<script>var enterococcus = '4';</script>",
    ].join("\n");
    expect(parseRow(row, "Monroe")).toBeNull();
  });

  it("keeps the newest sample per site, so a clearing resample wins", () => {
    const sink = new Map<string, import("../supabase/functions/_shared/fdoh").WqSample>();
    const mk = (date: string, ent: string) =>
      [
        '<tr class="cbResultSetDataRow">',
        "<span>Period:</span> 1305",
        "<span>Location:</span> A BEACH",
        `<span>Date:</span> ${date}`,
        '<div id="Latitude:x" >27.9</div>',
        '<div id="Longitude:x" >-82.8</div>',
        `<script>var enterococcus = '${ent}';</script>`,
      ].join("\n");
    parseResultSet(`${mk("7/20/2026", "240")}${mk("7/22/2026", "4")}</table>`, "Pinellas", sink);
    expect([...sink.values()][0]).toMatchObject({ date: "2026-07-22", valueCfu: 4, level: "good" });
  });
});
