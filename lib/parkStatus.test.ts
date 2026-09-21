import { describe, expect, it } from "vitest";
import type { Park, ParkAlert, Prediction, ReportSummary } from "./types";
import { getParkStatus, hasStatusBasis, isActiveClosureAlert } from "./parkStatus";
import { EMPTY_SUMMARY } from "./reportStatus";

const NOW = new Date("2026-09-05T15:00:00Z");

function makePark(overrides: Partial<Park> = {}): Park {
  return {
    id: "p1",
    slug: "poe-springs-park",
    name: "Poe Springs Park",
    type: "spring",
    operator: "county",
    lat: 29.82583,
    lng: -82.64928,
    coverage_tier: "deep",
    swimming_verified: true,
    guarded: "unknown",
    hours: null,
    fees: null,
    reservation_required: false,
    reservation_url: null,
    rules: {},
    usgs_site_id: null,
    river_gauge_site_id: "02322500",
    gauge_distance_km: 6,
    nws_grid: null,
    nws_zone: null,
    nws_county: null,
    typical_closure_time: "11:00",
    cavern_warning: false,
    safety_notes: null,
    official_url: null,
    photo_url: null,
    entrance_notes: null,
    swim_season: null,
    description: null,
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function makeAlert(overrides: Partial<ParkAlert> = {}): ParkAlert {
  return {
    id: "a1",
    park_id: "p1",
    kind: "closure",
    text: "Swimming area closed due to poor water clarity",
    source: "manual",
    official_url: "https://example.org",
    severity: null,
    starts_at: "2026-07-16T00:00:00Z",
    ends_at: null,
    hash: "h1",
    first_seen: "2026-07-16T00:00:00Z",
    last_seen: "2026-09-05T12:00:00Z",
    active: true,
    last_checked_at: "2026-09-05T12:00:00Z",
    ...overrides,
  };
}

function prediction(level: Prediction["level"], overrides: Partial<Prediction> = {}): Prediction {
  return {
    level,
    predictedTime: level === "none" || level === "closed" ? null : "2026-09-05T14:10:00.000Z",
    predictedTimeLabel: level === "none" || level === "closed" ? null : "around 10:10 AM",
    confidence: "high",
    score: level === "likely" ? 5 : level === "possible" ? 2 : 0,
    reasons: ["Weekend: parks fill faster"],
    isEstimate: true,
    ...overrides,
  };
}

function summary(overrides: Partial<ReportSummary>): ReportSummary {
  return { ...EMPTY_SUMMARY, freshestAt: "2026-09-05T14:40:00.000Z", ...overrides };
}

const reportedFull = summary({ signal: "reported", category: "entry", value: "turned_away", count: 1, impliesLevel: "full", confidence: "low" });
const confirmedFull = summary({ signal: "confirmed", category: "entry", value: "turned_away", count: 3, impliesLevel: "full", confidence: "high" });

describe("getParkStatus", () => {
  it("1. active closure alert → closed (alert), not an estimate", () => {
    const s = getParkStatus({ park: makePark(), alerts: [makeAlert()], reportSummary: confirmedFull, prediction: prediction("likely"), now: NOW });
    expect(s.level).toBe("closed");
    expect(s.source).toBe("alert");
    expect(s.isEstimate).toBe(false);
    expect(s.confidence).toBe("high");
    expect(s.updatedAt).toBe("2026-09-05T12:00:00Z");
    expect(s.reasons[0]).toContain("poor water clarity");
    expect(s.predictedTime).toBeNull();
  });

  it("auto-reopen: alert with active=false does NOT close the park", () => {
    const s = getParkStatus({ park: makePark(), alerts: [makeAlert({ active: false })], reportSummary: EMPTY_SUMMARY, prediction: prediction("none"), now: NOW });
    expect(s.level).toBe("open");
    expect(s.source).toBe("prediction");
  });

  it("auto-reopen: alert with ends_at in the past does NOT close the park", () => {
    const s = getParkStatus({ park: makePark(), alerts: [makeAlert({ ends_at: "2026-09-05T14:59:00Z" })], reportSummary: EMPTY_SUMMARY, prediction: prediction("none"), now: NOW });
    expect(s.level).toBe("open");
    const stillOn = getParkStatus({ park: makePark(), alerts: [makeAlert({ ends_at: "2026-09-05T15:01:00Z" })], reportSummary: EMPTY_SUMMARY, prediction: prediction("none"), now: NOW });
    expect(stillOn.level).toBe("closed");
  });

  it("alerts that have not started, or are notices/nws, do not close the park", () => {
    expect(getParkStatus({ park: makePark(), alerts: [makeAlert({ starts_at: "2026-09-06T00:00:00Z" })], reportSummary: EMPTY_SUMMARY, prediction: prediction("none"), now: NOW }).level).toBe("open");
    expect(getParkStatus({ park: makePark(), alerts: [makeAlert({ kind: "notice" })], reportSummary: EMPTY_SUMMARY, prediction: prediction("none"), now: NOW }).level).toBe("open");
    expect(getParkStatus({ park: makePark(), alerts: [makeAlert({ kind: "nws" })], reportSummary: EMPTY_SUMMARY, prediction: prediction("none"), now: NOW }).level).toBe("open");
    expect(isActiveClosureAlert(makeAlert({ starts_at: null }), NOW)).toBe(true);
  });

  it("2. out of swim season → closed (seasonal)", () => {
    const blue = makePark({ swim_season: { open: "04-01", close: "11-14", note: "Manatee season." } });
    const winter = new Date("2027-01-15T15:00:00Z");
    const s = getParkStatus({ park: blue, alerts: [], reportSummary: confirmedFull, prediction: prediction("likely"), now: winter });
    expect(s.level).toBe("closed");
    expect(s.source).toBe("seasonal");
    expect(s.reasons[0]).toContain("Apr 1");
    const summer = getParkStatus({ park: blue, alerts: [], reportSummary: EMPTY_SUMMARY, prediction: prediction("none"), now: NOW });
    expect(summer.level).toBe("open");
  });

  it("3. confirmed reports → implied level (confirmed_reports)", () => {
    const s = getParkStatus({ park: makePark(), alerts: [], reportSummary: confirmedFull, prediction: prediction("none"), now: NOW });
    expect(s.level).toBe("full");
    expect(s.source).toBe("confirmed_reports");
    expect(s.isEstimate).toBe(false);
    expect(s.updatedAt).toBe("2026-09-05T14:40:00.000Z");
    expect(s.reasons[0]).toContain("Turned away");
    expect(s.reasons[0]).toContain("3 people confirmed");

    // A confirmed "lot full" keeps the park open: it has not stopped admitting visitors.
    const lot = getParkStatus({ park: makePark(), alerts: [], reportSummary: summary({ signal: "confirmed", category: "parking", value: "lot_full", count: 4, impliesLevel: "open", confidence: "high" }), prediction: null, now: NOW });
    expect(lot.level).toBe("open");
    expect(lot.source).toBe("confirmed_reports");
  });

  it("confirmed reports with a cleared impliesLevel fall through to prediction", () => {
    const cleared = summary({ signal: "confirmed", category: "entry", value: "turned_away", count: 3, impliesLevel: null, confidence: "medium" });
    const s = getParkStatus({ park: makePark(), alerts: [], reportSummary: cleared, prediction: prediction("none"), now: NOW });
    expect(s.level).toBe("open");
    expect(s.source).toBe("prediction");
  });

  it("4. single full report + crowd prediction → full (report_prediction)", () => {
    const s = getParkStatus({ park: makePark(), alerts: [], reportSummary: reportedFull, prediction: prediction("likely"), now: NOW });
    expect(s.level).toBe("full");
    expect(s.source).toBe("report_prediction");
    expect(s.isEstimate).toBe(false);
    const possible = getParkStatus({ park: makePark(), alerts: [], reportSummary: reportedFull, prediction: prediction("possible"), now: NOW });
    expect(possible.level).toBe("full");
    // A queue plus a crowd forecast is still open; the prediction supplies the timing.
    const line = summary({ signal: "reported", category: "entry", value: "line", count: 1, impliesLevel: "open", confidence: "low" });
    const l = getParkStatus({ park: makePark(), alerts: [], reportSummary: line, prediction: prediction("likely"), now: NOW });
    expect(l.level).toBe("open");
  });

  it("4. single full report with a quiet prediction does NOT become full", () => {
    const s = getParkStatus({ park: makePark(), alerts: [], reportSummary: reportedFull, prediction: prediction("none"), now: NOW });
    expect(s.level).toBe("open");
    expect(s.source).toBe("prediction");
    expect(s.reasons.some((r) => r.includes("Turned away"))).toBe(true); // still shown as evidence
  });

  it("4b. single got_in report + quiet prediction → open (report_prediction)", () => {
    const gotIn = summary({ signal: "reported", category: "entry", value: "got_in", count: 1, impliesLevel: "open", confidence: "low" });
    const s = getParkStatus({ park: makePark(), alerts: [], reportSummary: gotIn, prediction: prediction("none"), now: NOW });
    expect(s.level).toBe("open");
    expect(s.source).toBe("report_prediction");
    const busy = getParkStatus({ park: makePark(), alerts: [], reportSummary: gotIn, prediction: prediction("likely"), now: NOW });
    expect(busy.source).toBe("prediction");
    expect(busy.level).toBe("open");
  });

  it("5. prediction only → open, with the predicted fill time as an estimate", () => {
    const likely = getParkStatus({ park: makePark(), alerts: [], reportSummary: EMPTY_SUMMARY, prediction: prediction("likely"), now: NOW });
    // Expected to fill later today is still open: the timing rides along in predictedTime.
    expect(likely.level).toBe("open");
    expect(likely.source).toBe("prediction");
    expect(likely.isEstimate).toBe(true);
    expect(likely.confidence).toBe("high");
    expect(likely.predictedTime).toBe("2026-09-05T14:10:00.000Z");
    expect(likely.updatedAt).toBe(NOW.toISOString());

    const possible = getParkStatus({ park: makePark(), alerts: [], reportSummary: EMPTY_SUMMARY, prediction: prediction("possible"), now: NOW });
    expect(possible.level).toBe("open");
    expect(possible.confidence).toBe("low");

    const none = getParkStatus({ park: makePark(), alerts: [], reportSummary: EMPTY_SUMMARY, prediction: prediction("none"), now: NOW });
    expect(none.level).toBe("open");
    expect(none.isEstimate).toBe(true);
    expect(none.predictedTime).toBeNull();
  });

  it("6. nothing to go on → unknown", () => {
    const s = getParkStatus({ park: makePark({ coverage_tier: "basic" }), alerts: [], reportSummary: EMPTY_SUMMARY, prediction: null, now: NOW });
    expect(s.level).toBe("unknown");
    expect(s.source).toBe("unknown");
    expect(s.updatedAt).toBeNull();
  });

  it("picks the most recently seen closure alert when several are active", () => {
    const older = makeAlert({ id: "old", text: "Old closure", last_seen: "2026-08-01T00:00:00Z" });
    const newer = makeAlert({ id: "new", text: "Newer closure", last_seen: "2026-09-05T13:00:00Z" });
    const s = getParkStatus({ park: makePark(), alerts: [older, newer], reportSummary: EMPTY_SUMMARY, prediction: null, now: NOW });
    expect(s.reasons[0]).toContain("Newer closure");
    expect(s.updatedAt).toBe("2026-09-05T13:00:00Z");
  });
});

describe("a lake nobody has recorded anything about", () => {
  const bareLake = {
    park: {
      slug: "lake-wauburg-fl",
      hours: null,
      swim_season: null,
      typical_closure_time: null,
      swimming_verified: false,
      guarded: "unknown",
      time_zone: null,
      lat: 29.53,
      lng: -82.3,
    },
    alerts: [],
    reportSummary: { signal: "none", category: null, value: null, sampleCount: 0, freshestAt: null },
    prediction: { level: "none", confidence: "low", reasons: [], predictedTime: null },
    now: new Date("2026-07-04T15:00:00Z"),
  } as unknown as Parameters<typeof getParkStatus>[0];

  it("is not called open", () => {
    // The harvest finds lakes by their public shore now, and most carry no hours, no
    // season and no reports. "Open" there is a claim with nothing behind it.
    expect(getParkStatus(bareLake).level).toBe("unknown");
  });

  it("says nothing rather than inventing a reason", () => {
    expect(getParkStatus(bareLake).reasons).toEqual([]);
  });

  it("is called open again as soon as there is something to go on", () => {
    const withHours = {
      ...bareLake,
      park: { ...bareLake.park, hours: "8 a.m. to sundown." },
    } as Parameters<typeof getParkStatus>[0];
    expect(hasStatusBasis(withHours)).toBe(true);
  });

  it("counts a visitor report as something to go on", () => {
    const reported = {
      ...bareLake,
      reportSummary: { ...bareLake.reportSummary, signal: "reported" },
    } as unknown as Parameters<typeof getParkStatus>[0];
    expect(hasStatusBasis(reported)).toBe(true);
  });
});
