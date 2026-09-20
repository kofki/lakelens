import type { Metadata } from "next";
import { Clock3, ShieldCheck, Zap } from "lucide-react";
import type { ParkWithStatus } from "@/lib/types";
import { getParksWithStatus } from "@/lib/queries";
import { ReportParkPicker } from "@/components/report/ReportParkPicker";
import { SiteFooter } from "@/components/nav/SiteFooter";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Report conditions",
  description: "Tell others what you found at the gate — one tap, no account.",
  alternates: { canonical: "/report" },
};

const HOW_IT_WORKS = [
  {
    icon: Zap,
    title: "One tap, no account",
    body: "Pick what you saw: got in, turned away, line at the gate, lot full.",
  },
  {
    icon: Clock3,
    title: "Reports fade after about two hours",
    body: "Conditions change fast, so old reports are dropped.",
  },
  {
    icon: ShieldCheck,
    title: "Three matching reports = confirmed",
    body: "Confirmed reports override the closure estimate.",
  },
];

export default async function ReportPage() {
  let parks: ParkWithStatus[] = [];
  try {
    parks = await getParksWithStatus();
  } catch {
    parks = [];
  }
  return (
    <>
      <div className="mx-auto w-full max-w-[1100px] flex-1 px-6 pb-8 pt-[calc(env(safe-area-inset-top)+12px)] md:py-12">
        <div className="md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-12 lg:gap-16">
          <header className="md:sticky md:top-[calc(var(--top-nav-h)+24px)] md:self-start">
            <h1 className="text-2xl font-extrabold text-brown md:text-4xl md:leading-tight">
              Report conditions
            </h1>
            <p className="mt-1 text-sm text-mocha md:mt-3 md:text-base">
              Pick the park you&apos;re at. One tap is enough &mdash; reports fade after about two hours.
            </p>
            {/* Desktop-only explainer; the picker itself carries the essentials on mobile. */}
            <ul className="mt-6 hidden space-y-4 md:block">
              {HOW_IT_WORKS.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 inline-flex shrink-0 rounded-full bg-aqua p-2 text-cyan-deep"
                  >
                    <Icon className="size-5" />
                  </span>
                  <span>
                    <span className="block font-bold text-ink">{title}</span>
                    <span className="block text-sm text-mocha">{body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </header>
          <div className="mt-4 min-w-0 md:mt-0">
            <ReportParkPicker parks={parks} />
          </div>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
