/**
 * lib/reportStatus.ts: collapses raw crowd reports (last 2 h) into one ReportSummary.
 *
 * Rules (see AGENTS.md / shared contract):
 * - Window: reports older than 2 h before `now` are ignored.
 * - Grouped by (category, value). Newer reports carry more weight.
 * - A group with >= 3 reports whose timestamps fall inside any 30-minute span is
 *   "confirmed"; a group with >= 1 report is "reported".
 * - Which group defines the summary: entry.turned_away > parking.lot_full > entry.line
 *   > entry.got_in > everything else (most recent first).
 * - contradicted: a got_in newer than the newest turned_away (or vice versa).
 * - impliesLevel: turned_away → full, got_in/line/lot_full → open, others → null.
 *   A queue or a full lot means "hurry", not "closed": the park is still letting people
 *   in, so the report text is surfaced as evidence under an Open status.
 * - confirmations = still_true − no_longer on the group's reports (min 0). If, within the
 *   last 30 min, no_longer answers outnumber still_true, impliesLevel is cleared to null.
 * - sampleCount = seeded (is_sample) reports in the group, so the UI can label them.
 * Pure TS: no React / Next / DOM.
 */
import type {
  Report,
  ReportCategory,
  ReportConfirmation,
  ReportSummary,
  ReportValue,
  StatusLevel,
} from "./types";
import { parseIso } from "./freshness";

export const REPORT_WINDOW_MS = 2 * 3600e3;
export const CONFIRM_CLUSTER_MS = 30 * 60e3;
export const CONFIRM_MIN_REPORTS = 3;
export const NO_LONGER_WINDOW_MS = 30 * 60e3;

/** Lower rank wins. Groups not listed rank 4 and tie-break by recency. */
const PRIORITY: Record<string, number> = {
  "entry:turned_away": 0,
  "parking:lot_full": 1,
  "entry:line": 2,
  "entry:got_in": 3,
};

export const IMPLIES_LEVEL: Partial<Record<ReportValue, StatusLevel>> = {
  turned_away: "full",
  line: "open",
  got_in: "open",
  lot_full: "open",
};

export const EMPTY_SUMMARY: ReportSummary = {
  signal: "none",
  category: null,
  value: null,
  count: 0,
  confirmations: 0,
  freshestAt: null,
  contradicted: false,
  confidence: "low",
  impliesLevel: null,
  sampleCount: 0,
};

interface Group {
  key: string;
  category: ReportCategory;
  value: ReportValue;
  reports: (Report & { t: number })[]; // newest first
  newest: number;
  weight: number;
  confirmed: boolean;
  sampleCount: number;
}

function recencyWeight(ageMs: number): number {
  if (ageMs <= 30 * 60e3) return 1;
  if (ageMs <= 60 * 60e3) return 0.7;
  return 0.4;
}

/** True when any 3 timestamps (sorted ascending) fall within a 30-minute span. */
function hasCluster(timesAsc: number[]): boolean {
  for (let i = 0; i + CONFIRM_MIN_REPORTS - 1 < timesAsc.length; i++) {
    if (timesAsc[i + CONFIRM_MIN_REPORTS - 1] - timesAsc[i] <= CONFIRM_CLUSTER_MS) return true;
  }
  return false;
}

export function summarizeReports(
  reports: Report[],
  confirmations: ReportConfirmation[],
  now: Date,
  opts: { includeSample?: boolean } = {},
): ReportSummary {
  const includeSample = opts.includeSample ?? true;
  const nowMs = now.getTime();

  const inWindow = (reports ?? [])
    .map((r) => ({ ...r, t: parseIso(r.created_at)?.getTime() ?? Number.NaN }))
    .filter((r) => Number.isFinite(r.t) && nowMs - r.t <= REPORT_WINDOW_MS)
    .filter((r) => includeSample || !r.is_sample);

  if (inWindow.length === 0) return { ...EMPTY_SUMMARY };

  const groups = new Map<string, Group>();
  for (const r of inWindow) {
    const key = `${r.category}:${r.value}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, category: r.category, value: r.value, reports: [], newest: 0, weight: 0, confirmed: false, sampleCount: 0 };
      groups.set(key, g);
    }
    g.reports.push(r);
    g.newest = Math.max(g.newest, r.t);
    g.weight += recencyWeight(nowMs - r.t);
    if (r.is_sample) g.sampleCount += 1;
  }
  for (const g of groups.values()) {
    g.reports.sort((a, b) => b.t - a.t);
    g.confirmed = hasCluster(g.reports.map((r) => r.t).sort((a, b) => a - b));
  }

  const ranked = [...groups.values()].sort((a, b) => {
    const ra = PRIORITY[a.key] ?? 4;
    const rb = PRIORITY[b.key] ?? 4;
    if (ra !== rb) return ra - rb;
    if (a.newest !== b.newest) return b.newest - a.newest;
    return b.weight - a.weight;
  });
  const chosen = ranked[0];

  // Contradiction only makes sense for the turned_away <-> got_in pair.
  let contradicted = false;
  if (chosen.value === "turned_away" || chosen.value === "got_in") {
    const opposite = chosen.value === "turned_away" ? "entry:got_in" : "entry:turned_away";
    const other = groups.get(opposite);
    if (other && other.newest > chosen.newest) contradicted = true;
  }

  const ids = new Set(chosen.reports.map((r) => r.id));
  let stillTrue = 0;
  let noLonger = 0;
  let recentStillTrue = 0;
  let recentNoLonger = 0;
  for (const c of confirmations ?? []) {
    if (!ids.has(c.report_id)) continue;
    const t = parseIso(c.created_at)?.getTime();
    const recent = t !== undefined && Number.isFinite(t) && nowMs - t <= NO_LONGER_WINDOW_MS;
    if (c.response === "still_true") {
      stillTrue += 1;
      if (recent) recentStillTrue += 1;
    } else if (c.response === "no_longer") {
      noLonger += 1;
      if (recent) recentNoLonger += 1;
    }
  }
  const netConfirmations = Math.max(0, stillTrue - noLonger);
  const cleared = recentNoLonger > 0 && recentNoLonger > recentStillTrue;

  const signal = chosen.confirmed ? "confirmed" : "reported";
  let confidence: ReportSummary["confidence"] = signal === "confirmed" ? "high" : chosen.reports.length >= 2 ? "medium" : "low";
  if (contradicted || cleared) confidence = confidence === "high" ? "medium" : "low";

  return {
    signal,
    category: chosen.category,
    value: chosen.value,
    count: chosen.reports.length,
    confirmations: netConfirmations,
    freshestAt: new Date(chosen.newest).toISOString(),
    contradicted,
    confidence,
    impliesLevel: cleared ? null : IMPLIES_LEVEL[chosen.value] ?? null,
    sampleCount: chosen.sampleCount,
  };
}
