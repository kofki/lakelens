import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/components/ui/cn";

const EXPLORE: { href: "/" | "/list" | "/report" | "/about"; label: string }[] = [
  { href: "/", label: "Map" },
  { href: "/list", label: "Explore parks" },
  { href: "/report", label: "Report conditions" },
  { href: "/about", label: "About" },
];

/** Where today's park data comes from. Add a source here as coverage reaches its state. */
const CREDITS: { href: string; label: string }[] = [
  { href: "https://waterdata.usgs.gov/", label: "USGS Water Services" },
  { href: "https://www.weather.gov/documentation/services-web-api", label: "National Weather Service" },
  { href: "https://openfreemap.org/", label: "OpenStreetMap contributors / OpenFreeMap" },
  { href: "https://www.floridastateparks.org/", label: "Florida State Parks" },
];

const HEADING = "mb-4 text-[1.1rem] font-extrabold text-peach";
const LINK =
  "inline-flex min-h-11 items-center text-[0.9rem] leading-[1.8] text-sand underline-offset-4 transition-colors hover:text-peach hover:underline";

/**
 * Marketing-style footer for content pages: About, Offline, Report, List,
 * Park. Not rendered by app/layout.tsx so the map page stays full-height. Deep-forest
 * background with sage text (10:1); moss-sand links (6.3:1); sunlight headings (10:1).
 */
export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("mt-10 bg-brown-deep px-6 py-12 text-mist md:px-8", className)}>
      <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-10 md:grid-cols-[2fr_1fr_1fr] md:gap-12">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Logo className="size-9" />
            <span className="text-xl font-extrabold text-white">LakeLens</span>
          </div>
          <p className="max-w-prose text-[0.95rem] leading-relaxed">
            Crowding estimates, one-tap visitor reports, parking and accessibility for the
            springs, lakes and rivers you can swim in.
          </p>
          <p className="text-[0.9rem] text-sand">Built at SASEhack 2026.</p>
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
          Informational only. Conditions change quickly. Follow posted rules and park staff. Not affiliated with any
          park operator.
        </p>
        <p className="shrink-0">&copy; 2026 LakeLens</p>
      </div>
    </footer>
  );
}
