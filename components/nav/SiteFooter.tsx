import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/components/ui/cn";

/** Brown (#3d2518) footer used on content pages (About, Offline). Cream text passes 12:1. */
export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("mt-10 bg-cocoa text-cream", className)}>
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-8 text-sm">
        <div className="flex items-center gap-2">
          <Logo className="size-8" />
          <span className="text-lg font-extrabold">LakeLens</span>
        </div>
        <p className="max-w-prose text-cream/90">
          Know before you go. Closure estimates, one-tap crowd reports, parking and accessibility for
          Florida&rsquo;s springs and state-park swim areas.
        </p>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 font-bold">
            <li>
              <Link href="/" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
                Map
              </Link>
            </li>
            <li>
              <Link href="/list" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
                List
              </Link>
            </li>
            <li>
              <Link href="/report" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
                Report
              </Link>
            </li>
            <li>
              <Link href="/about" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
                About
              </Link>
            </li>
          </ul>
        </nav>
        <p className="text-xs text-cream/80">
          Informational only. Conditions change quickly. Follow posted rules and park staff. Not affiliated with
          Florida State Parks. Map data &copy; OpenStreetMap contributors, tiles by OpenFreeMap. Weather via the
          National Weather Service and Open-Meteo (CC BY 4.0). Water data via USGS.
        </p>
        <p className="text-xs text-cream/80">Built at SASEhack 2026 by the BeachLens team.</p>
      </div>
    </footer>
  );
}
