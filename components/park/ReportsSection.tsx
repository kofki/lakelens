"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import type { Park, Report, ReportConfirmation, ReportSummary } from "@/lib/types";
import { reportLine } from "@/lib/plainLanguage";
import { Badge } from "@/components/ui/Badge";
import { Section } from "@/components/ui/Section";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReportButton } from "@/components/report/ReportButton";
import { ReportCard } from "@/components/report/ReportCard";
import { StillTruePrompt } from "@/components/report/StillTruePrompt";
import { useStaleRefresh } from "@/components/report/useStaleRefresh";

export interface ReportsSectionProps {
  park: Park;
  reports: Report[];
  confirmations: ReportConfirmation[];
  summary: ReportSummary;
  usgsFetchedAt: string | null;
  weatherFetchedAt: string | null;
  /** ISO timestamp of the server render, to keep relative times stable on hydration */
  nowIso: string;
}

const STILL_TRUE_AFTER_MS = 30 * 60e3;
const POLL_MS = 60e3;

export function ReportsSection({ park, reports, confirmations, summary, usgsFetchedAt, weatherFetchedAt, nowIso }: ReportsSectionProps) {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date(nowIso));
  const [optimistic, setOptimistic] = useState<Report[]>([]);

  useStaleRefresh(park.id, usgsFetchedAt, weatherFetchedAt, !!(park.usgs_site_id || park.river_gauge_site_id));

  // Refresh once a minute while the tab is visible so new reports show up.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") {
        setNow(new Date());
        router.refresh();
      }
    };
    const id = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(id);
  }, [router]);

  const netConfirmations = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of confirmations) {
      map.set(c.report_id, (map.get(c.report_id) ?? 0) + (c.response === "still_true" ? 1 : -1));
    }
    return map;
  }, [confirmations]);

  const all = useMemo(() => {
    const ids = new Set(reports.map((r) => r.id));
    return [...optimistic.filter((r) => !ids.has(r.id)), ...reports].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [reports, optimistic]);

  const promptFor = useMemo(() => {
    if (summary.signal === "none" || !summary.impliesLevel || !["full", "likely_full"].includes(summary.impliesLevel)) return null;
    const freshest = all.find((r) => r.category === summary.category && r.value === summary.value);
    if (!freshest) return null;
    return now.getTime() - new Date(freshest.created_at).getTime() >= STILL_TRUE_AFTER_MS ? freshest : null;
  }, [summary, all, now]);

  return (
    <Section
      id="reports"
      title="Recent reports"
      icon={<MessagesSquare aria-hidden="true" focusable="false" />}
      action={<ReportButton park={park} size="md" onSubmitted={(r) => setOptimistic((o) => [r, ...o])} />}
    >
      {summary.signal !== "none" && (
        <p className="text-sm font-bold text-cocoa">
          {reportLine(summary, now)} {summary.sampleCount > 0 && <Badge variant="sample" className="ml-1 align-middle" />}
        </p>
      )}

      {promptFor && <StillTruePrompt report={promptFor} now={now} onAnswered={() => router.refresh()} />}

      {all.length === 0 ? (
        <EmptyState
          title="No reports in the last two hours"
          body="Are you there right now? Your report helps the next person decide whether to drive."
          action={<ReportButton park={park} variant="secondary" size="md" label="Be the first to report" />}
        />
      ) : (
        <ul className="space-y-2" aria-label="Reports, newest first">
          {all.slice(0, 12).map((r) => (
            <li key={r.id}>
              <ReportCard report={r} confirmations={Math.max(0, netConfirmations.get(r.id) ?? 0)} now={now} />
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-mocha">Reports are anonymous and expire after about two hours. Three matching reports within 30 minutes count as confirmed.</p>
    </Section>
  );
}
