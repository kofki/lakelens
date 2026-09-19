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
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <Wordmark className="mb-6" />
        <Card as="section" className="space-y-4 text-center">
          <div aria-hidden="true" className="mx-auto inline-flex rounded-full bg-peach p-4 text-cocoa">
            <WifiOff className="size-8" />
          </div>
          <h1 className="text-2xl font-extrabold">You&rsquo;re offline</h1>
          <p className="mx-auto max-w-prose text-cocoa/75">
            LakeLens needs a connection to show live status, water conditions and reports. Park status changes
            quickly, so we don&rsquo;t show old data as if it were current.
          </p>
          <p className="mx-auto max-w-prose text-sm text-cocoa/75">
            When you&rsquo;re back online, reload this page. If you are at a park, follow posted signs and staff.
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
