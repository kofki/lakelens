/**
 * lib/parkStatus.ts — combines official alerts, seasonal rules, crowd reports and the
 * closure prediction into one ParkStatus. Closures are data, not code: an active
 * closure alert (or being out of swim season) closes a park, and deactivating / expiring
 * that alert reopens it on the next request.
 *
 * Priority:
 * 1. active closure alert (kind=closure, active, starts_at null|<=now, ends_at null|>now) → closed (alert)
 * 2. out of swim season → closed (seasonal)
 * 3. confirmed reports with an implied level → that level (confirmed_reports)
 * 4. single/reported full|likely_full agreeing with a possible|likely prediction → full / likely_full (report_prediction)
 * 4b. reported "got in" agreeing with a "none" prediction → open (report_prediction)
 * 5. prediction: likely → likely_full, possible → likely_full (low confidence), none → open (prediction, estimate)
 * 6. otherwise unknown
 * Pure TS: no React / Next / DOM.
 */
import type { Park, ParkAlert, ParkStatus, Prediction, ReportSummary } from "./types";
import { swimSeasonReason } from "./seasonal";
import { parseIso, relativeTime } from "./freshness";
import { reportLine } from "./plainLanguage";

export interface ParkStatusInput {
  park: Park;
  alerts: ParkAlert[];
  reportSummary: ReportSummary;
  prediction: Prediction | null;
  now: Date;
}

/** An alert counts as in force when it is active and `now` sits inside [starts_at, ends_at). */
export function isAlertInForce(alert: ParkAlert, now: Date): boolean {
  if (!alert || alert.active !== true) return false;
  const t = now.getTime();
  const starts = parseIso(alert.starts_at);
  if (starts && starts.getTime() > t) return false;
  const ends = parseIso(alert.ends_at);
  if (ends && ends.getTime() <= t) return false;
  return true;
}

export function isActiveClosureAlert(alert: ParkAlert, now: Date): boolean {
  return alert?.kind === "closure" && isAlertInForce(alert, now);
}

/** Closure alerts in force right now, most recently seen first. */
export function activeClosureAlerts(alerts: ParkAlert[], now: Date): ParkAlert[] {
  return (alerts ?? [])
    .filter((a) => isActiveClosureAlert(a, now))
    .sort((a, b) => (parseIso(b.last_seen)?.getTime() ?? 0) - (parseIso(a.last_seen)?.getTime() ?? 0));
}

function sourceLabel(alert: ParkAlert): string {
  const s = (alert.source ?? "").toLowerCase();
  if (s === "manual") return "Official notice, entered manually";
  if (s === "nws") return "National Weather Service";
  return alert.source ? `Source: ${alert.source}` : "Official notice";
}

export function getParkStatus(input: ParkStatusInput): ParkStatus {
  const { park, alerts, reportSummary, prediction, now } = input;
  const nowIso = now.toISOString();

  // 1. Official closure alert
  const closure = activeClosureAlerts(alerts, now)[0];
  if (closure) {
    const checked = closure.last_checked_at ?? closure.last_seen;
    return {
      level: "closed",
      source: "alert",
      confidence: "high",
      reasons: [`Official closure: ${closure.text}`, `${sourceLabel(closure)} · checked ${relativeTime(checked, now)}`],
      updatedAt: closure.last_seen ?? nowIso,
      isEstimate: false,
      predictedTime: null,
    };
  }

  // 2. Seasonal closure
  const seasonal = swimSeasonReason(park.swim_season, now);
  if (seasonal) {
    return {
      level: "closed",
      source: "seasonal",
      confidence: "high",
      reasons: [seasonal],
      updatedAt: nowIso,
      isEstimate: false,
      predictedTime: null,
    };
  }

  const summary = reportSummary ?? null;
  const predReasons = prediction?.reasons ?? [];

  // 3. Confirmed reports
  if (summary && summary.signal === "confirmed" && summary.impliesLevel) {
    return {
      level: summary.impliesLevel,
      source: "confirmed_reports",
      confidence: summary.confidence,
      reasons: [reportLine(summary, now), ...predReasons],
      updatedAt: summary.freshestAt ?? nowIso,
      isEstimate: false,
      predictedTime: null,
    };
  }

  // 4. Single report agreeing with the prediction
  if (summary && summary.signal === "reported" && prediction) {
    const implied = summary.impliesLevel;
    const predictsCrowd = prediction.level === "possible" || prediction.level === "likely";
    if ((implied === "full" || implied === "likely_full") && predictsCrowd) {
      return {
        level: implied === "full" ? "full" : "likely_full",
        source: "report_prediction",
        confidence: summary.contradicted ? "low" : summary.confidence === "low" ? "medium" : summary.confidence,
        reasons: [reportLine(summary, now), ...predReasons],
        updatedAt: summary.freshestAt ?? nowIso,
        isEstimate: false,
        predictedTime: null,
      };
    }
    // 4b. "Got in" agreeing with a quiet prediction
    if (implied === "open" && prediction.level === "none") {
      return {
        level: "open",
        source: "report_prediction",
        confidence: summary.contradicted ? "low" : "medium",
        reasons: [reportLine(summary, now), ...predReasons],
        updatedAt: summary.freshestAt ?? nowIso,
        isEstimate: false,
        predictedTime: null,
      };
    }
  }

  // 5. Prediction only (always an estimate)
  if (prediction) {
    const reasons = [...predReasons];
    if (summary && summary.signal !== "none") reasons.push(reportLine(summary, now));
    if (prediction.level === "closed") {
      // Defensive: predictClosure saw a closure we did not (should not happen when callers pass the same alerts).
      return {
        level: "closed",
        source: "alert",
        confidence: prediction.confidence,
        reasons,
        updatedAt: nowIso,
        isEstimate: false,
        predictedTime: null,
      };
    }
    const level = prediction.level === "none" ? "open" : "likely_full";
    return {
      level,
      source: "prediction",
      confidence: prediction.level === "possible" ? "low" : prediction.confidence,
      reasons,
      updatedAt: nowIso,
      isEstimate: true,
      predictedTime: prediction.predictedTime,
    };
  }

  // 6. Nothing to go on
  const reasons = ["Not enough data yet — no forecast or reports for this park"];
  if (summary && summary.signal !== "none") reasons.push(reportLine(summary, now));
  return {
    level: "unknown",
    source: "unknown",
    confidence: "low",
    reasons,
    updatedAt: summary?.freshestAt ?? null,
    isEstimate: false,
    predictedTime: null,
  };
}
