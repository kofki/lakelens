import { describe, expect, it } from "vitest";
import type { Report, ReportConfirmation } from "./types";
import { summarizeReports } from "./reportStatus";

const NOW = new Date("2026-09-05T15:00:00Z");
let seq = 0;

function minutesAgo(min: number): string {
  return new Date(NOW.getTime() - min * 60e3).toISOString();
}

function makeReport(value: Report["value"], min: number, overrides: Partial<Report> = {}): Report {
  seq += 1;
  const category: Report["category"] =
    value === "got_in" || value === "turned_away" || value === "line"
      ? "entry"
      : value === "lot_full" || value === "overflow_open"
        ? "parking"
        : value === "ramp_blocked" || value === "wheelchair_available" || value === "restroom_closed"
          ? "accessibility"
          : "conditions";
  return {
    id: `r${seq}`,
    park_id: "p1",
    category,
    value,
    note: null,
    photo_url: null,
    device_id: `d${seq}`,
    is_sample: false,
    created_at: minutesAgo(min),
    ...overrides,
  };
}

function confirm(report: Report, response: ReportConfirmation["response"], min: number): ReportConfirmation {
  seq += 1;
  return { id: `c${seq}`, report_id: report.id, device_id: `cd${seq}`, response, created_at: minutesAgo(min) };
}

describe("summarizeReports", () => {
  it("returns an empty summary with no reports", () => {
    const s = summarizeReports([], [], NOW);
    expect(s.signal).toBe("none");
    expect(s.count).toBe(0);
    expect(s.impliesLevel).toBeNull();
    expect(s.freshestAt).toBeNull();
  });

  it("ignores reports older than the 2 h window", () => {
    const s = summarizeReports([makeReport("turned_away", 121), makeReport("turned_away", 200)], [], NOW);
    expect(s.signal).toBe("none");
    const t = summarizeReports([makeReport("turned_away", 119)], [], NOW);
    expect(t.signal).toBe("reported");
    expect(t.count).toBe(1);
  });

  it("single report → reported, low confidence, implies full", () => {
    const r = makeReport("turned_away", 25);
    const s = summarizeReports([r], [], NOW);
    expect(s.signal).toBe("reported");
    expect(s.category).toBe("entry");
    expect(s.value).toBe("turned_away");
    expect(s.impliesLevel).toBe("full");
    expect(s.confidence).toBe("low");
    expect(s.freshestAt).toBe(r.created_at);
  });

  it("3 matching reports within 30 min → confirmed, high confidence", () => {
    const s = summarizeReports([makeReport("turned_away", 5), makeReport("turned_away", 20), makeReport("turned_away", 34)], [], NOW);
    expect(s.signal).toBe("confirmed");
    expect(s.count).toBe(3);
    expect(s.confidence).toBe("high");
    expect(s.impliesLevel).toBe("full");
  });

  it("3 matching reports spread over more than 30 min → only reported (medium)", () => {
    const s = summarizeReports([makeReport("turned_away", 0), makeReport("turned_away", 40), makeReport("turned_away", 80)], [], NOW);
    expect(s.signal).toBe("reported");
    expect(s.count).toBe(3);
    expect(s.confidence).toBe("medium");
  });

  it("finds a 30-min cluster inside a larger group", () => {
    const s = summarizeReports(
      [makeReport("turned_away", 110), makeReport("turned_away", 70), makeReport("turned_away", 12), makeReport("turned_away", 5), makeReport("turned_away", 30)],
      [],
      NOW,
    );
    expect(s.signal).toBe("confirmed");
    expect(s.count).toBe(5);
  });

  it("priority: turned_away beats lot_full beats line beats got_in beats others", () => {
    const all = [makeReport("crowded", 1), makeReport("got_in", 2), makeReport("line", 3), makeReport("lot_full", 4), makeReport("turned_away", 50)];
    expect(summarizeReports(all, [], NOW).value).toBe("turned_away");
    expect(summarizeReports(all.slice(0, 4), [], NOW).value).toBe("lot_full");
    expect(summarizeReports(all.slice(0, 3), [], NOW).value).toBe("line");
    expect(summarizeReports(all.slice(0, 2), [], NOW).value).toBe("got_in");
    const others = summarizeReports([makeReport("gator", 30), makeReport("crowded", 10)], [], NOW);
    expect(others.value).toBe("crowded"); // most recent among "others"
    expect(others.impliesLevel).toBeNull();
  });

  it("impliesLevel mapping", () => {
    // A queue or a full lot is a "hurry" signal, not a closure: the park is still open.
    expect(summarizeReports([makeReport("line", 5)], [], NOW).impliesLevel).toBe("open");
    expect(summarizeReports([makeReport("lot_full", 5)], [], NOW).impliesLevel).toBe("open");
    expect(summarizeReports([makeReport("got_in", 5)], [], NOW).impliesLevel).toBe("open");
    expect(summarizeReports([makeReport("water_murky", 5)], [], NOW).impliesLevel).toBeNull();
  });

  it("contradiction: got_in newer than the newest turned_away lowers confidence", () => {
    const s = summarizeReports([makeReport("turned_away", 40), makeReport("got_in", 10)], [], NOW);
    expect(s.value).toBe("turned_away");
    expect(s.contradicted).toBe(true);
    expect(s.confidence).toBe("low");
    const notContradicted = summarizeReports([makeReport("turned_away", 10), makeReport("got_in", 40)], [], NOW);
    expect(notContradicted.contradicted).toBe(false);
    const reverse = summarizeReports([makeReport("got_in", 40), makeReport("turned_away", 10)], [], NOW);
    expect(reverse.value).toBe("turned_away");
    expect(reverse.contradicted).toBe(false);
  });

  it("counts sample reports and can exclude them", () => {
    const reports = [
      makeReport("turned_away", 5, { is_sample: true }),
      makeReport("turned_away", 10, { is_sample: true }),
      makeReport("turned_away", 15),
    ];
    const withSample = summarizeReports(reports, [], NOW);
    expect(withSample.signal).toBe("confirmed");
    expect(withSample.count).toBe(3);
    expect(withSample.sampleCount).toBe(2);
    const without = summarizeReports(reports, [], NOW, { includeSample: false });
    expect(without.signal).toBe("reported");
    expect(without.count).toBe(1);
    expect(without.sampleCount).toBe(0);
  });

  it("confirmations = still_true − no_longer (min 0), only on the chosen group", () => {
    const a = makeReport("turned_away", 5);
    const b = makeReport("turned_away", 10);
    const other = makeReport("lot_full", 3);
    const s = summarizeReports(
      [a, b, other],
      [confirm(a, "still_true", 2), confirm(a, "still_true", 1), confirm(b, "still_true", 1), confirm(b, "no_longer", 60), confirm(other, "still_true", 1)],
      NOW,
    );
    expect(s.value).toBe("turned_away");
    expect(s.confirmations).toBe(2);
    expect(s.impliesLevel).toBe("full"); // the no_longer is old and outnumbered

    const t = summarizeReports([a], [confirm(a, "no_longer", 50), confirm(a, "no_longer", 55)], NOW);
    expect(t.confirmations).toBe(0);
    expect(t.impliesLevel).toBe("full"); // both no_longer are older than 30 min → not cleared
  });

  it("a recent no_longer majority clears impliesLevel", () => {
    const a = makeReport("turned_away", 20);
    const b = makeReport("turned_away", 25);
    const c = makeReport("turned_away", 30);
    const s = summarizeReports([a, b, c], [confirm(a, "no_longer", 5), confirm(b, "no_longer", 4), confirm(c, "still_true", 3)], NOW);
    expect(s.signal).toBe("confirmed");
    expect(s.impliesLevel).toBeNull();
    expect(s.confirmations).toBe(0);
    expect(s.confidence).toBe("medium");
  });
});
