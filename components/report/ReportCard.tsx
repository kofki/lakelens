import { CheckCircle2, MessageSquare } from "lucide-react";
import { REPORT_CATEGORY_LABELS, REPORT_VALUE_LABELS, type Report } from "@/lib/types";
import { relativeTime } from "@/lib/freshness";
import { Badge } from "@/components/ui/Badge";

export interface ReportCardProps {
  report: Report;
  /** net "still true" confirmations for this report */
  confirmations: number;
  now: Date;
}

export function ReportCard({ report, confirmations, now }: ReportCardProps) {
  const label = REPORT_VALUE_LABELS[report.value] ?? report.value;
  return (
    <article className="rounded-xl border border-mist bg-white p-3" aria-label={`${label}, reported ${relativeTime(report.created_at, now)}`}>
      <div className="flex flex-wrap items-center gap-2">
        <MessageSquare aria-hidden="true" focusable="false" className="h-4 w-4 text-mocha" />
        <p className="text-sm font-extrabold text-cocoa">{label}</p>
        <span className="text-xs text-mocha">{REPORT_CATEGORY_LABELS[report.category]}</span>
        <span className="ml-auto text-xs text-mocha">{relativeTime(report.created_at, now)}</span>
      </div>
      {report.note && <p className="mt-1 text-sm text-cocoa">{report.note}</p>}
      {report.photo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={report.photo_url} alt="Photo attached to this report" className="mt-2 max-h-48 rounded-lg object-cover" loading="lazy" />
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge variant={report.is_sample ? "sample" : "user"} />
        {confirmations > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-status-open">
            <CheckCircle2 aria-hidden="true" focusable="false" className="h-3.5 w-3.5" />
            {confirmations} {confirmations === 1 ? "person" : "people"} confirmed
          </span>
        )}
      </div>
    </article>
  );
}
