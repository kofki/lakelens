import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Wordmark } from "@/components/ui/Logo";
import { SiteFooter } from "@/components/nav/SiteFooter";

export const metadata: Metadata = {
  title: "Offline",
  description: "LakeLens needs a connection to load live park status.",
  robots: { index: false },
};

/** Served by the service worker when a page load fails without a connection. */
export default function OfflinePage() {
  return (
    <>
      <div className="mx-auto w-full max-w-[1100px] flex-1 px-6 py-10 md:py-16">
        <Wordmark className="mb-6 md:hidden" />
        <Card as="section" className="mx-auto max-w-2xl space-y-4 text-center md:p-10">
          <div aria-hidden="true" className="mx-auto inline-flex rounded-full bg-aqua p-4 text-cyan-deep">
            <WifiOff className="size-8" />
          </div>
          <h1 className="text-2xl font-extrabold text-brown md:text-4xl">You&rsquo;re offline</h1>
          <p className="mx-auto max-w-prose text-mocha">
            LakeLens needs a connection to show live status, water conditions and reports. Park status changes
            quickly, so we don&rsquo;t show old data as if it were current.
          </p>
          <p className="mx-auto max-w-prose text-sm text-mocha">
            When you&rsquo;re back online, reload this page. If you are at a park, follow posted signs and
            staff.
          </p>
          <ButtonLink href="/" size="lg">
            Try again
          </ButtonLink>
        </Card>
      </div>
      <SiteFooter />
    </>
  );
}
