import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { ParkBundle, ParkWithStatus } from "@/lib/types";
import { getParkBundle, getParkSlugs, getParksWithStatus } from "@/lib/queries";
import { Hero } from "@/components/park/Hero";
import { StatusHeader, type SectionLink } from "@/components/park/StatusHeader";
import { PredictionCard } from "@/components/park/PredictionCard";
import { AlertsCard, activeAlerts } from "@/components/park/AlertsCard";
import { SafetyCard } from "@/components/park/SafetyCard";
import { ParkingCard } from "@/components/park/ParkingCard";
import { AccessibilityCard } from "@/components/park/AccessibilityCard";
import { ConditionsCard } from "@/components/park/ConditionsCard";
import { RulesCard } from "@/components/park/RulesCard";
import { ReportsSection } from "@/components/park/ReportsSection";
import { BackupSuggestions } from "@/components/park/BackupSuggestions";
import { ReportButton } from "@/components/report/ReportButton";

export const revalidate = 60;

type Params = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  try {
    const slugs = await getParkSlugs();
    return slugs.map((slug) => ({ slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  try {
    const bundle = await getParkBundle(slug);
    if (!bundle) return { title: "Park not found" };
    return {
      title: bundle.park.name,
      description:
        bundle.park.description ??
        `Status, closure estimate, parking, accessibility and safety information for ${bundle.park.name}.`,
      openGraph: bundle.park.photo_url ? { images: [bundle.park.photo_url] } : undefined,
    };
  } catch {
    return { title: "Park" };
  }
}

export default async function ParkPage({ params }: Params) {
  const { slug } = await params;
  const now = new Date();
  let bundle: ParkBundle | null = null;
  let all: ParkWithStatus[] = [];
  try {
    [bundle, all] = await Promise.all([getParkBundle(slug, now), getParksWithStatus(now)]);
  } catch {
    bundle = null;
  }
  if (!bundle) notFound();

  const { park } = bundle;
  const deep = park.coverage_tier === "deep";
  const alerts = activeAlerts(bundle.alerts, now);
  const showBackups = ["full", "likely_full", "closed"].includes(bundle.status.level);

  const sections: SectionLink[] = [
    { id: "status", label: "Status" },
    ...(deep ? [{ id: "prediction", label: "Estimate" }] : []),
    ...(alerts.length ? [{ id: "alerts", label: "Alerts" }] : []),
    ...(showBackups ? [{ id: "backups", label: "Backups" }] : []),
    { id: "safety", label: "Safety" },
    { id: "parking", label: "Parking" },
    { id: "accessibility", label: "Accessibility" },
    { id: "conditions", label: "Conditions" },
    { id: "rules", label: "Rules" },
    { id: "reports", label: "Reports" },
  ];

  return (
    <article className="mx-auto w-full max-w-3xl pb-24">
      <Hero park={park} />

      <div className="space-y-6 px-4 pt-4">
        <div id="status" className="scroll-mt-4">
          <StatusHeader bundle={bundle} now={now} sections={sections} />
        </div>

        {deep && (
          <div>
            <PredictionCard park={park} prediction={bundle.prediction} />
          </div>
        )}

        {alerts.length > 0 && (
          <div>
            <AlertsCard alerts={bundle.alerts} now={now} />
          </div>
        )}

        {showBackups && (
          <Suspense fallback={null}>
            <BackupSuggestions target={bundle} all={all} initial={bundle.backups} />
          </Suspense>
        )}

        <div>
          <SafetyCard park={park} usgs={bundle.usgs} usgsFetchedAt={bundle.usgsFetchedAt} now={now} />
        </div>

        <div>
          <ParkingCard park={park} lots={bundle.parkingLots} />
        </div>

        <div>
          <AccessibilityCard park={park} accessibility={bundle.accessibility} />
        </div>

        <ConditionsCard bundle={bundle} now={now} />

        <RulesCard park={park} />

        <ReportsSection
          park={park}
          reports={bundle.reports}
          confirmations={bundle.confirmations}
          summary={bundle.reportSummary}
          usgsFetchedAt={bundle.usgsFetchedAt}
          weatherFetchedAt={bundle.weatherFetchedAt}
          nowIso={now.toISOString()}
        />

        <p className="rounded-xl bg-mist/50 p-3 text-xs text-cocoa">
          <strong>Informational only.</strong> Conditions change quickly and estimates can be wrong. Follow posted rules and park
          staff. LakeLens is not affiliated with Florida State Parks or any park operator.
        </p>
      </div>

      <div
        className="fixed right-4 z-20"
        style={{ bottom: "calc(var(--bottom-nav-h) + env(safe-area-inset-bottom) + 16px)" }}
      >
        <ReportButton park={park} className="shadow-[var(--shadow-card)]" />
      </div>
    </article>
  );
}
