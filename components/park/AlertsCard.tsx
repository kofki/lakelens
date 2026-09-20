import { CloudLightning, ExternalLink, Info, OctagonX, type LucideIcon } from "lucide-react";
import type { AlertKind, ParkAlert } from "@/lib/types";
import { isAlertInForce } from "@/lib/parkStatus";
import { STALE, formatLocalDate, isStale, relativeTime } from "@/lib/freshness";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { Section } from "@/components/ui/Section";

export interface AlertsCardProps {
  alerts: ParkAlert[];
  now: Date;
  /** The park's IANA zone, so alert dates read in the park's own local time. */
  timeZone?: string | null;
}

/** Label colour + the left accent bar on the card. Kind is always spelled out in text as well. */
const KIND: Record<AlertKind, { label: string; icon: LucideIcon; tone: string; accent: string }> = {
  closure: { label: "Closure", icon: OctagonX, tone: "text-status-closed", accent: "border-l-4 border-l-status-closed-edge" },
  notice: { label: "Notice", icon: Info, tone: "text-cyan-deep", accent: "border-l-4 border-l-cyan" },
  nws: { label: "Weather alert", icon: CloudLightning, tone: "text-status-likely", accent: "border-l-4 border-l-status-likely-edge" },
};

/** Alerts in force right now, closures first, then newest. */
export function activeAlerts(alerts: ParkAlert[], now: Date): ParkAlert[] {
  const order: Record<AlertKind, number> = { closure: 0, nws: 1, notice: 2 };
  return (alerts ?? [])
    .filter((a) => isAlertInForce(a, now))
    .sort((a, b) => order[a.kind] - order[b.kind] || (Date.parse(b.last_seen) || 0) - (Date.parse(a.last_seen) || 0));
}

function sourceLine(alert: ParkAlert, now: Date): { text: string; source: string; at: string | null } {
  if (alert.source === "nws") {
    return { text: "National Weather Service", source: "NWS", at: alert.last_seen };
  }
  const checked = alert.last_checked_at ?? alert.last_seen;
  return { text: `Entered manually · last checked ${relativeTime(checked, now)}`, source: "Official notice", at: checked };
}

/** Official closures, notices and NWS weather alerts. Renders nothing when none are in force. */
export function AlertsCard({ alerts, now, timeZone }: AlertsCardProps) {
  const tz = timeZone || undefined;
  const list = activeAlerts(alerts, now);
  if (list.length === 0) return null;

  return (
    <Section id="alerts" title="Official notices" icon={<Info />} action={<Badge variant="official" />}>
      <ul className="space-y-3">
        {list.map((a) => {
          const meta = KIND[a.kind];
          const Icon = meta.icon;
          const src = sourceLine(a, now);
          const stale = isStale(a.last_seen, STALE.alerts, now);
          return (
            <li key={a.id}>
              <Card as="article" className={`space-y-2 ${meta.accent}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 text-sm font-extrabold ${meta.tone}`}>
                    <Icon aria-hidden="true" focusable="false" className="size-5 shrink-0" strokeWidth={2.25} />
                    {meta.label}
                  </span>
                  {a.severity && (
                    <span className="rounded-full bg-cream px-2 py-0.5 text-xs font-bold text-cocoa">Severity: {a.severity}</span>
                  )}
                </div>
                <p className="whitespace-pre-line text-sm text-cocoa">{a.text}</p>
                <p className="text-xs text-mocha">
                  {a.starts_at ? <>Since {formatLocalDate(a.starts_at, tz)}</> : <>Start date not stated</>}
                  {" · "}
                  {a.ends_at ? <>Until {formatLocalDate(a.ends_at, tz)}</> : <>No end date announced</>}
                </p>
                <LastUpdated at={src.at} source={src.text} stale={stale} prefix="Seen" />
                {a.official_url && (
                  <a
                    href={a.official_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-brown underline underline-offset-2"
                  >
                    Read the official notice
                    <ExternalLink aria-hidden="true" focusable="false" className="size-4" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
