import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Nunito } from "next/font/google";
import "./globals.css";
import "@/components/nav/nav.css";
import { SkipLink } from "@/components/a11y/SkipLink";
import { BottomNav } from "@/components/nav/BottomNav";
import { TopNav } from "@/components/nav/TopNav";
import { InstallHint } from "@/components/pwa/InstallHint";
import { RegisterSW } from "@/components/pwa/RegisterSW";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-nunito",
  display: "swap",
});

const DESCRIPTION =
  "Florida springs and state-park swim areas: which are open, which fill early, and where there is still room in the water.";

function metadataBase(): URL | undefined {
  try {
    // lakelens.vercel.app belongs to someone else; this project deploys to the long alias.
    return new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://lakelens-kenzo-fukudas-projects.vercel.app");
  } catch {
    return undefined;
  }
}

export const metadata: Metadata = {
  metadataBase: metadataBase(),
  title: { default: "LakeLens", template: "%s | LakeLens" },
  description: DESCRIPTION,
  applicationName: "LakeLens",
  appleWebApp: { capable: true, title: "LakeLens", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: "LakeLens",
    title: "LakeLens",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "LakeLens",
    description: "Which Florida springs are open right now, which are likely to fill, and where else you can get in the water.",
  },
};

/* userScalable stays enabled: 200 % zoom is an accessibility requirement.
 * viewportFit "cover" makes env(safe-area-inset-bottom) real on iPhones. */
export const viewport: Viewport = {
  themeColor: "#1f4d3a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${nunito.variable} h-full`}>
      <body className="flex min-h-full flex-col bg-cream text-cocoa">
        <SkipLink />
        <TopNav />
        {/* Bottom padding clears the mobile BottomNav; top padding clears the desktop TopNav.
         * The footer is not rendered here so the map page stays full-height: content pages
         * render <SiteFooter /> themselves. */}
        <main
          id="main"
          tabIndex={-1}
          className="flex flex-1 flex-col outline-none pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] md:pb-0 md:pt-[var(--top-nav-h)]"
        >
          {children}
        </main>
        <BottomNav />
        <RegisterSW />
        <InstallHint />
      </body>
    </html>
  );
}
