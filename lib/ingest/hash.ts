/** Stable SHA-256 hex for park_alerts.hash (Node runtime only). */
import { createHash } from "node:crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Manual (admin) alert identity: same park + kind + text => same row. */
export function manualAlertHash(parkId: string, kind: string, text: string): string {
  return sha256Hex(`${parkId}|${kind}|${text.trim()}`);
}

/**
 * NWS alert identity. The contract says sha256(alert id + headline); park_id is prefixed because
 * park_alerts.hash is UNIQUE table-wide and one statewide alert can match several parks.
 */
export function nwsAlertHash(parkId: string, alertId: string, headline: string): string {
  return sha256Hex(`${parkId}|${alertId}|${headline}`);
}
