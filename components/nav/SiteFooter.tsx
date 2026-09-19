import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/components/ui/cn";

const EXPLORE: { href: "/" | "/list" | "/report" | "/about"; label: string }[] = [
  { href: "/", label: "Map" },
  { href: "/list", label: "Explore parks" },
  { href: "/report", label: "Report conditions" },
  { href: "/about", label: "About" },
];

const CREDITS: { href: string; label: string }[] = [
  { href: "https://waterdata.usgs.gov/", label: "USGS Water Services" },
  { href: "https://www.weather.gov/documentation/services-web-api", label: "National Weather Service" },
  { href: "https://open-meteo.com/", label: "Open-Meteo (CC BY 4.0)" },
  { href: "https://openfreemap.org/", label: "OpenStreetMap contributors / OpenFreeMap" },
  { href: "https://www.floridastateparks.org/", label: "Florida State Parks" },
];

const HEADING = "mb-4 text-[1.1rem] font-extrabold text-sunset";
const LINK =
  "inline-flex min-h-11 items-center text-[0.9rem] leading-[1.8] text-[#ceaa94] underline-offset-4 transition-colors hover:text-sunset hover:underline";

/**
 * Marketing-style footer (BeachLens family) for content pages: About, Offline, Report, List,
 * Park. Not rendered by app/layout.tsx so the map page stays full-height. Warm brown
 * background with mist text (~10:1); sand links (~5:1) against the brown.
 */
export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("mt-10 bg-[#4a3728] px-6 py-12 text-[#e1d7ce] md:px-8", className)}>
      <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-10 md:grid-cols-[2fr_1fr_1fr] md:gap-12">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Logo className="size-9" />
            <span className="text-xl font-extrabold text-white">LakeLens</span>
          </div>
          <p className="max-w-prose text-[0.95rem] leading-relaxed">
            Know before you go. Closure estimates, one-tap crowd reports, parking and accessibility for
            Florida&rsquo;s springs and state-park swim areas.
          </p>
          <p className="text-[0.9rem] text-[#ceaa94]">Built at SASEhack 2026 by the BeachLens team.</p>
        </div>

        <nav aria-labelledby="footer-explore-heading">
          <h2 id="footer-explore-heading" className={HEADING}>
            Explore
          </h2>
          <ul className="space-y-1">
            {EXPLORE.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={LINK}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-labelledby="footer-credits-heading">
          <h2 id="footer-credits-heading" className={HEADING}>
            Data &amp; credits
          </h2>
          <ul className="space-y-1">
            {CREDITS.map((l) => (
              <li key={l.href}>
                <a href={l.href} target="_blank" rel="noopener noreferrer" className={LINK}>
                  {l.label}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="mx-auto mt-8 flex max-w-[1100px] flex-col gap-2 border-t border-white/10 pt-6 text-xs md:flex-row md:items-start md:justify-between md:gap-8">
        <p className="max-w-prose">
          Informational only. Conditions change quickly. Follow posted rules and park staff. Not affiliated
          with Florida State Parks.
        </p>
        <p className="shrink-0">&copy; 2026 LakeLens</p>
      </div>
    </footer>
  );
}
