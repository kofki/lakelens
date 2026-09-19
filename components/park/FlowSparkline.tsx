"use client";

/**
 * 24-hour USGS flow sparkline for the Conditions card.
 *
 * Fetches GET /api/parks/{parkId}/flow-history?hours=24 once on mount (CDN-cached 30 min upstream) and
 * draws an inline SVG line + area. Renders nothing when the park has no gauge (`siteId` null).
 * Accessibility: the SVG is decorative (aria-hidden); a visually-hidden sentence carries min/max/now,
 * and the <figcaption> names the window and source. Loading / empty / error states are one quiet line.
 */
import { useEffect, useState } from "react";

export interface FlowSparklineProps {
  parkId: string;
  siteId: string | null;
}

interface FlowPoint {
  t: string;
  v: number;
}

interface FlowHistoryResponse {
  ok: boolean;
  site: string | null;
  parameter: "00060" | "00065" | null;
  unit: string | null;
  points: FlowPoint[];
}

type State = { status: "loading" } | { status: "error" } | { status: "ready"; data: FlowHistoryResponse };

const WIDTH = 100;
const HEIGHT = 48;
const PAD_Y = 4;

function unitLabel(unit: string | null, parameter: FlowHistoryResponse["parameter"]): string {
  if (unit === "ft3/s" || parameter === "00060") return "cfs";
  if (unit === "ft" || parameter === "00065") return "ft";
  return unit ?? "";
}

function fmt(v: number): string {
  return Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1);
}

/** Map points onto a 100x48 box; returns the line path and the closed area path. */
export function sparklinePaths(points: FlowPoint[]): { line: string; area: string; min: number; max: number } {
  const values = points.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const n = points.length;
  const coords = points.map((p, i) => {
    const x = n === 1 ? WIDTH / 2 : (i / (n - 1)) * WIDTH;
    const y = HEIGHT - PAD_Y - ((p.v - min) / span) * (HEIGHT - PAD_Y * 2);
    return [Number(x.toFixed(2)), Number(y.toFixed(2))] as const;
  });
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  const area = `${line} L${coords[coords.length - 1][0]} ${HEIGHT} L${coords[0][0]} ${HEIGHT} Z`;
  return { line, area, min, max };
}

export function FlowSparkline({ parkId, siteId }: FlowSparklineProps) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!siteId) return;
    let mounted = true;
    const controller = new AbortController();
    fetch(`/api/parks/${encodeURIComponent(parkId)}/flow-history?hours=24`, { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<FlowHistoryResponse>) : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        if (mounted) setState({ status: "ready", data });
      })
      .catch(() => {
        if (mounted) setState({ status: "error" });
      });
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [parkId, siteId]);

  if (!siteId) return null;

  const quiet = "mt-2 text-xs text-mocha";
  if (state.status === "loading") return <p className={quiet}>Loading flow history…</p>;
  if (state.status === "error") return <p className={quiet}>Flow history isn&apos;t available right now.</p>;

  const { data } = state;
  const points = data.points.filter((p) => Number.isFinite(p.v));
  if (!data.site || points.length < 2) return <p className={quiet}>No flow readings in the last 24 hours.</p>;

  const { line, area, min, max } = sparklinePaths(points);
  const now = points[points.length - 1].v;
  const unit = unitLabel(data.unit, data.parameter);
  const what = data.parameter === "00065" ? "Water level" : "Flow";
  const summary = `${what} over the last 24 hours: min ${fmt(min)}, max ${fmt(max)} ${unit}, now ${fmt(now)}`;

  return (
    <figure className="mt-3">
      <p className="sr-only">{summary}</p>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        width="100%"
        height={HEIGHT}
        aria-hidden="true"
        focusable="false"
        className="block"
      >
        <path d={area} fill="var(--color-aqua)" />
        <path d={line} fill="none" stroke="var(--color-cyan-deep)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="mt-1 flex justify-between text-xs text-mocha">
        <span>Last 24 h · USGS</span>
        <span aria-hidden="true">
          {fmt(min)}–{fmt(max)} {unit} · now {fmt(now)}
        </span>
      </figcaption>
    </figure>
  );
}

export default FlowSparkline;
