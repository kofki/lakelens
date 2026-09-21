import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { ParkBundle } from "@/lib/types";
import { getParkBundle, getParkMeta, getPrerenderParkSlugs } from "@/lib/queries";
import { Hero } from "@/components/park/Hero";
import { StatusHeader } from "@/components/park/StatusHeader";
import { SectionTabs, type SectionLink } from "@/components/park/SectionTabs";
import { PlanSidebar } from "@/components/park/PlanSidebar";
import { PredictionCard } from "@/components/park/PredictionCard";
import { AlertsCard, activeAlerts } from "@/components/park/AlertsCard";
import { SafetyCard } from "@/components/park/SafetyCard";
import { ParkingCard } from "@/components/park/ParkingCard";
import { AmenitiesCard } from "@/components/park/AmenitiesCard";
import { AccessibilityCard } from "@/components/park/AccessibilityCard";
import { ConditionsCard } from "@/components/park/ConditionsCard";
import { RulesCard } from "@/components/park/RulesCard";
import { ReportsSection } from "@/components/park/ReportsSection";
import { ReviewsSection } from "@/components/review/ReviewsSection";
import { VisitorPhotos } from "@/components/review/VisitorPhotos";
import { BackupSuggestions } from "@/components/park/BackupSuggestions";
import { ReportButton } from "@/components/report/ReportButton";
import { SiteFooter } from "@/components/nav/SiteFooter";
import { ParkJsonLd } from "@/components/park/ParkJsonLd";
import { RecordVisit } from "@/components/park/RecordVisit";

export const revalidate = 60;

type Params = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  try {
    const slugs = await getPrerenderParkSlugs();
    return slugs.map((slug) => ({ slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  try {
    const park = await getParkMeta(slug);
    if (!park) return { title: "Park not found" };
    return {
      title: park.name,
      description:
        park.description ??
        `Status, closure estimate, parking, accessibility and safety information for ${park.name}.`,
      alternates: { canonical: `/park/${slug}` },
      // No `images` here: the generated card beside this page (opengraph-image.tsx) carries
      // the logo, the park's name and its status. A bare Commons photo said none of that.
      openGraph: {
        type: "article",
        url: `/park/${slug}`,
      },
    };
  } catch {
    return { title: "Park" };
  }
}

export default async function ParkPage({ params }: Params) {
  const { slug } = await params;
  const now = new Date();
  let bundle: ParkBundle | null = null;
  try {
    bundle = await getParkBundle(slug, now);
  } catch {
    bundle = null;
  }
  if (!bundle) notFound();

  const { park } = bundle;
  const alerts = activeAlerts(bundle.alerts, now);
  const showBackups = ["full", "closed"].includes(bundle.status.level);

  // Only sections that actually render get a jump link, so the tab bar never points at
  // an empty anchor on a park we know less about.
  const sections: SectionLink[] = [
    { id: "status", label: "Status" },
    ...(bundle.prediction ? [{ id: "prediction", label: "Crowds" }] : []),
    ...(alerts.length ? [{ id: "alerts", label: "Alerts" }] : []),
    ...(showBackups ? [{ id: "backups", label: "Backups" }] : []),
    { id: "safety", label: "Safety" },
    ...(bundle.parkingLots.length ? [{ id: "parking", label: "Parking" }] : []),
    ...(park.amenities && Object.keys(park.amenities).length ? [{ id: "amenities", label: "Amenities" }] : []),
    ...(bundle.accessibility ? [{ id: "accessibility", label: "Accessibility" }] : []),
    { id: "conditions", label: "Conditions" },
    ...(park.hours || park.fees || park.official_url ? [{ id: "rules", label: "Rules" }] : []),
    { id: "reports", label: "Reports" },
    { id: "reviews", label: "Reviews" },
  ];

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://lakelens-kenzo-fukudas-projects.vercel.app";

  return (
    <>
      <RecordVisit slug={park.slug} />
      <ParkJsonLd park={park} status={bundle.status} origin={origin} />
      <article className="mx-auto w-full max-w-[1100px] px-4 pb-24 md:px-6 lg:pb-12">
        <Hero park={park} status={bundle.status} reviewStats={bundle.reviewStats ?? null} />

        <VisitorPhotos reviews={bundle.reviews} />

        <SectionTabs sections={sections} className="mt-4 md:mt-6" />

        <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
          <div className="min-w-0 space-y-6">
            <StatusHeader bundle={bundle} now={now} />

            <PredictionCard prediction={bundle.prediction} />

            {alerts.length > 0 && <AlertsCard alerts={bundle.alerts} now={now} timeZone={bundle.park.time_zone} />}

            {showBackups && (
              <Suspense fallback={null}>
                <BackupSuggestions target={bundle} all={bundle.nearby ?? []} initial={bundle.backups} />
              </Suspense>
            )}

            <SafetyCard park={park} usgs={bundle.usgs} usgsFetchedAt={bundle.usgsFetchedAt} now={now} />

            <ParkingCard park={park} lots={bundle.parkingLots} />

            <AmenitiesCard park={park} />

            <AccessibilityCard accessibility={bundle.accessibility} />

            <ConditionsCard bundle={bundle} now={now} />

            <RulesCard park={park} now={now} />

            <ReportsSection
              park={park}
              reports={bundle.reports}
              confirmations={bundle.confirmations}
              summary={bundle.reportSummary}
              usgsFetchedAt={bundle.usgsFetchedAt}
              weatherFetchedAt={bundle.weatherFetchedAt}
              nowIso={now.toISOString()}
            />

            <ReviewsSection park={park} reviews={bundle.reviews} stats={bundle.reviewStats ?? null} />

            <p className="rounded-xl bg-mist/50 p-3 text-xs text-cocoa">
              <strong>Informational only.</strong> Conditions change quickly and estimates can be wrong. Follow posted rules and
              park staff. LakeLens is not affiliated with any park operator.
            </p>
          </div>

          <PlanSidebar
            bundle={bundle}
            now={now}
            className="hidden space-y-4 self-start lg:sticky lg:top-[calc(var(--top-nav-h)+80px)] lg:block"
          />
        </div>

        <div className="fixed right-4 bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+16px)] z-20 md:bottom-6 lg:hidden">
          <ReportButton park={park} className="shadow-[var(--shadow-card)]" />
        </div>
      </article>
      <SiteFooter />
    </>
  );
}
