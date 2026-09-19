import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Nunito } from "next/font/google";
import "./globals.css";
import "@/components/nav/nav.css";
import { SkipLink } from "@/components/a11y/SkipLink";
import { BottomNav } from "@/components/nav/BottomNav";
import { InstallHint } from "@/components/pwa/InstallHint";
import { RegisterSW } from "@/components/pwa/RegisterSW";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-nunito",
  display: "swap",
});

const DESCRIPTION =
  "Know before you go: closure estimates, one-tap crowd reports, parking and accessibility for Florida's springs and state-park swim areas.";

function metadataBase(): URL | undefined {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://lakelens.vercel.app");
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
};

/* userScalable stays enabled: 200 % zoom is an accessibility requirement.
 * viewportFit "cover" makes env(safe-area-inset-bottom) real on iPhones. */
export const viewport: Viewport = {
  themeColor: "#fe8b00",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${nunito.variable} h-full`}>
      <body className="flex min-h-full flex-col bg-cream text-cocoa">
        <SkipLink />
        <main
          id="main"
          tabIndex={-1}
          className="flex flex-1 flex-col outline-none pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))]"
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
