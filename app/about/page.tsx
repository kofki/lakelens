import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  BookOpen,
  CalendarDays,
  CloudRain,
  Compass,
  Database,
  ExternalLink,
  Gauge,
  Heart,
  Megaphone,
  Rocket,
  Scale,
  ShieldCheck,
  Sun,
  ThermometerSun,
  TriangleAlert,
  Users,
  WavesLadder,
} from "lucide-react";
import { STATUS_META, STATUS_ORDER } from "@/lib/status";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Wordmark } from "@/components/ui/Logo";
import { Section } from "@/components/ui/Section";
import { StatusPill } from "@/components/ui/StatusPill";
import { SiteFooter } from "@/components/nav/SiteFooter";
import { SideNav } from "./SideNav";

export const metadata: Metadata = {
  title: "About",
  description:
    "How LakeLens estimates closures, how crowd reports work, what is verified, where the data comes from, and who built it.",
  alternates: { canonical: "/about" },
};

const TOC: { id: string; label: string }[] = [
  { id: "what", label: "What LakeLens does" },
  { id: "estimate", label: "How the closure estimate works" },
  { id: "reports", label: "How reports work" },
  { id: "verified", label: "Verified vs unverified" },
  { id: "sources", label: "Data sources" },
  { id: "rules", label: "Park rules" },
  { id: "disclaimer", label: "Disclaimer" },
  { id: "team", label: "About the team" },
  { id: "roadmap", label: "Roadmap" },
];

interface Factor {
  icon: ReactNode;
  label: string;
  points: string;
  note: string;
}

const FACTORS: Factor[] = [
  {
    icon: <CalendarDays />,
    label: "Weekend",
    points: "+2",
    note: "Saturday or Sunday.",
  },
  {
    icon: <Sun />,
    label: "Holiday or holiday weekend",
    points: "+3",
    note: "US public holidays and the long weekends around them (Memorial Day, July 4, Labor Day…).",
  },
  {
    icon: <Users />,
    label: "College or local event",
    points: "+1",
    note: "UF home games, spring break and other calendar events near the park. Some events count more.",
  },
  {
    icon: <ThermometerSun />,
    label: "Forecast high 90°F or more",
    points: "+1",
    note: "95°F or more adds two extra points (three in total). Hot days fill springs fast.",
  },
  {
    icon: <CloudRain />,
    label: "Rain chance 50 % or more",
    points: "−2",
    note: "Rain thins crowds, so the score goes down.",
  },
];

const SOURCES: { name: string; href: string; what: string; licence: string }[] = [
  {
    name: "USGS Water Services",
    href: "https://waterdata.usgs.gov/",
    what: "Spring flow, river stage and water temperature from real-time gauges.",
    licence: "U.S. public domain. Real-time readings are provisional and subject to revision.",
  },
  {
    name: "National Weather Service (api.weather.gov)",
    href: "https://www.weather.gov/documentation/services-web-api",
    what: "Hourly and 7-day forecasts plus active weather alerts by county and zone.",
    licence: "U.S. public domain.",
  },
  {
    name: "Nager.Date",
    href: "https://date.nager.at/",
    what: "US public holidays and long weekends used by the closure estimate.",
    licence: "Open API (MIT-licensed project).",
  },
  {
    name: "OpenStreetMap contributors / OpenFreeMap",
    href: "https://openfreemap.org/",
    what: "Base map tiles and some parking-lot locations.",
    licence: "© OpenStreetMap contributors (ODbL). Tiles: OpenFreeMap © OpenMapTiles.",
  },
  {
    name: "Florida State Parks",
    href: "https://www.floridastateparks.org/",
    what: "Hours, fees, rules, reservation links and official closure notices for state parks.",
    licence: "Official park pages; notices are entered by hand with a link to the source.",
  },
  {
    name: "Alachua County Parks",
    href: "https://alachuacounty.us/Depts/Parks/Pages/Parks.aspx",
    what: "Poe Springs Park hours, fees and closures.",
    licence: "Official county pages.",
  },
  {
    name: "Ginnie Springs Outdoors",
    href: "https://ginniespringsoutdoors.com/",
    what: "Admission, rules and safety information for the privately run Ginnie Springs.",
    licence: "Official operator pages.",
  },
];

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-bold text-brown underline decoration-moss decoration-2 underline-offset-4 hover:decoration-brown"
    >
      {children}
      <ExternalLink aria-hidden="true" className="size-3.5" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

export default function AboutPage() {
  return (
    <>
      <div className="mx-auto w-full max-w-[1100px] flex-1 px-6 py-10 md:py-16">
        <header className="space-y-4 md:space-y-5">
          <Wordmark size="lg" className="md:hidden" />
          <h1 className="max-w-[18ch] text-[2rem] font-extrabold leading-tight text-brown md:text-[3rem]">
            Never drive out to a closed gate.
          </h1>
          <p className="max-w-prose text-mocha md:text-lg">
            LakeLens tells you whether a Florida spring or state-park swim area is likely to be full, closed
            or open before you drive out, and shows the parking and accessibility details that decide whether
            a trip works for you.
          </p>
          {/* Mobile: chip list of section links. Desktop gets the sticky side nav below instead. */}
          <nav aria-label="On this page" className="md:hidden">
            <ul className="flex flex-wrap gap-2">
              {TOC.map((t) => (
                <li key={t.id}>
                  <a
                    href={`#${t.id}`}
                    className="inline-flex min-h-11 items-center rounded-full border border-mist bg-white px-4 text-sm font-bold text-brown shadow-card hover:border-moss"
                  >
                    {t.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </header>

        <div className="mt-10 md:mt-14 md:grid md:grid-cols-[240px_1fr] md:gap-12">
          <aside className="hidden md:block">
            <nav
              aria-label="On this page"
              className="md:sticky md:top-[calc(var(--top-nav-h)+24px)] md:max-h-[calc(100vh-var(--top-nav-h)-48px)] md:overflow-y-auto"
            >
              <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-brown">On this page</p>
              <SideNav items={TOC} />
            </nav>
          </aside>

          <div className="min-w-0 space-y-10">
            <Section id="what" title="What LakeLens does" icon={<Compass />}>
              <Card className="space-y-3">
                <ul className="list-disc space-y-2 pl-5 text-cocoa">
                  <li>
                    <span className="font-bold">Closure estimate.</span> A transparent score that says how
                    likely a park is to hit capacity today, and roughly when.
                  </li>
                  <li>
                    <span className="font-bold">One-tap crowd reports.</span> Got in, turned away, line at the
                    gate, lot full. No account needed.
                  </li>
                  <li>
                    <span className="font-bold">Backup suggestions.</span> When a park is full or closed, the
                    nearest open alternatives with drive time and parking notes.
                  </li>
                  <li>
                    <span className="font-bold">Live conditions.</span> Spring flow, water temperature and
                    forecast in plain language, each with its source and last-updated time.
                  </li>
                  <li>
                    <span className="font-bold">Accessibility and parking.</span> Water entry type, ADA
                    parking, accessible restrooms, loaner wheelchairs, and where the lots are.
                  </li>
                  <li>
                    <span className="font-bold">Safety cards.</span> Lifeguard status, cave and cavern
                    warnings, cold water, currents and park rules.
                  </li>
                </ul>
                <p className="text-sm text-mocha">
                  Every status is shown as an icon plus words, never a colour on its own:
                </p>
                <ul className="flex flex-wrap gap-2">
                  {STATUS_ORDER.map((level) => (
                    <li key={level} className="flex flex-col gap-1">
                      <StatusPill level={level} />
                      <span className="sr-only">{STATUS_META[level].description}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </Section>

            <Section id="estimate" title="How the closure estimate works" icon={<Gauge />}>
              <Card className="space-y-4">
                <p className="text-sm text-mocha">
                  Parks never publish live capacity, so we score the day instead. Treat the time as a
                  guide, not a guarantee.
                </p>
                <p>
                  Each park starts at zero and we add or subtract points for the things that fill springs:
                </p>
                <ul className="divide-y divide-mist rounded-xl border border-mist">
                  {FACTORS.map((f) => (
                    <li key={f.label} className="flex items-start gap-3 p-3">
                      <span
                        aria-hidden="true"
                        className="mt-0.5 inline-flex shrink-0 text-taupe [&>svg]:size-5"
                      >
                        {f.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="font-bold">{f.label}</span>
                        <span className="block text-sm text-mocha">{f.note}</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-cream px-2.5 py-1 text-sm font-extrabold tabular-nums">
                        {f.points}
                      </span>
                    </li>
                  ))}
                </ul>
                <dl className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl bg-cream p-3">
                    <dt className="text-xs font-bold text-mocha">Score 0 or less</dt>
                    <dd className="mt-1 space-y-1">
                      <StatusPill level="open" size="sm" />
                      <p className="text-xs text-mocha">No crowd expected.</p>
                    </dd>
                  </div>
                  <div className="rounded-xl bg-cream p-3">
                    <dt className="text-xs font-bold text-mocha">Score 1 to 2 (possible)</dt>
                    <dd className="mt-1 space-y-1">
                      <StatusPill level="open" size="sm" />
                      <p className="text-xs text-mocha">Still open. We show the time it usually fills.</p>
                    </dd>
                  </div>
                  <div className="rounded-xl bg-cream p-3">
                    <dt className="text-xs font-bold text-mocha">Score 3 or more (likely)</dt>
                    <dd className="mt-1 space-y-1">
                      <StatusPill level="open" size="sm" />
                      <p className="text-xs text-mocha">Open, but go early. It is likely to fill today.</p>
                    </dd>
                  </div>
                </dl>
                <p className="rounded-xl bg-aqua p-3 text-sm text-cyan-deep">
                  A park is only marked <strong>Full</strong> or <strong>Closed</strong> once it has actually
                  stopped letting people in: an official closure, the swim season, or visitors reporting they
                  were turned away. Everything else stays <strong>Open</strong>, with the estimate shown
                  alongside it.
                </p>
                <ul className="list-disc space-y-2 pl-5 text-sm">
                  <li>
                    <span className="font-bold">Predicted time.</span> Parks with a known typical fill time
                    (for example &ldquo;usually fills around 10:30 AM on weekends&rdquo;) get an estimated
                    time that moves 25 minutes earlier for every point above 2. Parks without one just show
                    the level.
                  </li>
                  <li>
                    <span className="font-bold">Official closures win.</span> An active closure notice, or a
                    swim area that is out of season, always shows <span className="font-bold">Closed</span> no
                    matter the score. When the notice ends, the park reopens automatically.
                  </li>
                  <li>
                    <span className="font-bold">Confidence.</span> High when we have a fresh forecast, a
                    typical fill time and deep coverage for that park; medium when one is missing; low
                    otherwise. Weekdays with no events simply say &ldquo;closures are rare&rdquo;.
                  </li>
                  <li>
                    <span className="font-bold">Reports can override it.</span> Confirmed visitor reports beat
                    the estimate (see below).
                  </li>
                </ul>
              </Card>
            </Section>

            <Section id="reports" title="How reports work" icon={<Megaphone />}>
              <Card className="space-y-3">
                <ul className="list-disc space-y-2 pl-5">
                  <li>
                    <span className="font-bold">One tap, no account.</span> Pick what you saw: got in, turned
                    away, line at the gate, lot full, water high, gator sighting and a few more. A note and a
                    photo are optional. Your device gets a random ID so we can rate-limit (5 reports per 10
                    minutes) without knowing who you are.
                  </li>
                  <li>
                    <span className="font-bold">Reports expire after 2 hours.</span> Anything older is dropped
                    from the status. Conditions at a spring change fast, so stale reports would mislead.
                  </li>
                  <li>
                    <span className="font-bold">3 matching reports within 30 minutes = confirmed.</span> A
                    single &ldquo;turned away&rdquo; shows as <Badge variant="user">Reported</Badge>; three
                    people saying the same thing in half an hour makes it{" "}
                    <Badge variant="verified">Confirmed</Badge>, and confirmed reports override the estimate.
                  </li>
                  <li>
                    <span className="font-bold">&ldquo;Still full?&rdquo; prompts.</span> When a full or
                    turned-away status is more than 30 minutes old, people at the park are asked whether it is
                    still true. A majority of &ldquo;no longer&rdquo; answers clears it.
                  </li>
                  <li>
                    <span className="font-bold">Contradictions are shown, not hidden.</span> A newer
                    &ldquo;got in&rdquo; after a &ldquo;turned away&rdquo; lowers our confidence and both are
                    visible.
                  </li>
                  <li>
                    <span className="font-bold">Sample data is labelled.</span> During the hackathon demo some
                    parks carry seeded reports marked <Badge variant="sample" />. They are never counted as
                    real confirmations in the wild.
                  </li>
                </ul>
                <ButtonLink href="/report" variant="secondary">
                  <Megaphone aria-hidden="true" />
                  Send a report
                </ButtonLink>
              </Card>
            </Section>

            <Section id="verified" title="Verified vs unverified" icon={<ShieldCheck />}>
              <Card className="space-y-3">
                <p>
                  We only call something verified when an official page says it. Everything else is labelled
                  so you can decide how much to trust it.
                </p>
                <dl className="space-y-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
                    <dt className="shrink-0 sm:w-40">
                      <Badge variant="verified" />
                    </dt>
                    <dd className="text-sm text-mocha">
                      Stated on the park&rsquo;s official page (Florida State Parks, Alachua County, Ginnie
                      Springs Outdoors), with a link to the source.
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
                    <dt className="shrink-0 sm:w-40">
                      <Badge variant="unverified" />
                    </dt>
                    <dd className="text-sm text-mocha">
                      Accessibility details we could not confirm officially, OpenStreetMap parking lots, and
                      anything a visitor reported. Shown as text, including &ldquo;unknown&rdquo; where we
                      simply do not know.
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
                    <dt className="shrink-0 sm:w-40">
                      <Badge variant="official" />
                    </dt>
                    <dd className="text-sm text-mocha">
                      Closure and notice alerts are entered manually from official notices and show when they
                      were last checked. We do not scrape park websites.
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
                    <dt className="shrink-0 sm:w-40">
                      <Badge variant="typical" />
                    </dt>
                    <dd className="text-sm text-mocha">
                      Values like &ldquo;spring water is typically 72°F&rdquo; when there is no live gauge.
                      Never presented as a live reading.
                    </dd>
                  </div>
                </dl>
                <p className="flex items-start gap-2 rounded-xl bg-peach p-3 text-sm text-cocoa">
                  <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-cocoa" />
                  <span>
                    <span className="font-bold">Lifeguards:</span> most Florida springs have no lifeguard on
                    duty. We show &ldquo;yes&rdquo;, &ldquo;no&rdquo; or &ldquo;unknown&rdquo; per park; treat
                    &ldquo;unknown&rdquo; as no.
                  </span>
                </p>
              </Card>
            </Section>

            <Section id="sources" title="Data sources" icon={<Database />}>
              <Card padded={false}>
                <ul className="divide-y divide-mist">
                  {SOURCES.map((s) => (
                    <li key={s.name} className="space-y-1 p-4">
                      <ExtLink href={s.href}>{s.name}</ExtLink>
                      <p className="text-sm">{s.what}</p>
                      <p className="text-xs text-mocha">{s.licence}</p>
                    </li>
                  ))}
                </ul>
              </Card>
              <p className="text-sm text-mocha">
                Each number in the app shows where it came from and when it was last fetched. Water data older
                than 6 hours, forecasts older than 3 hours and reports older than 2 hours are flagged as
                possibly out of date.
              </p>
            </Section>

            <Section id="rules" title="Park rules" icon={<Scale />}>
              <Card className="space-y-3">
                <p>
                  Florida State Parks follow the Florida Administrative Code. Under{" "}
                  <ExtLink href="https://flrules.elaws.us/fac/62d-2.014">F.A.C. 62D-2.014</ExtLink>:
                </p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>
                    <span className="font-bold">Alcohol is prohibited</span> in state parks except in
                    designated areas, restaurants and sanctioned events.
                  </li>
                  <li>
                    <span className="font-bold">Pets are excluded from swimming areas</span>, both the land
                    and the water portions, as well as buildings, playgrounds and food-service areas.
                  </li>
                </ul>
                <p className="text-sm text-mocha">
                  Each park card lists its own tubing, life-jacket and inflatable rules from the official
                  page. Ginnie Springs and Poe Springs are not state parks and set their own rules. See the{" "}
                  <ExtLink href="https://www.floridastateparks.org/Rules">
                    Florida State Parks rules page
                  </ExtLink>{" "}
                  for the full list.
                </p>
              </Card>
            </Section>

            <Section id="disclaimer" title="Disclaimer" icon={<BookOpen />}>
              <Card className="space-y-2 text-sm">
                <p>
                  LakeLens is <span className="font-bold">informational only</span>. Closure estimates are
                  estimates, visitor reports are unverified, and conditions at springs and rivers change
                  quickly.
                </p>
                <p>
                  Always follow posted rules, signs and park staff. Swim at your own risk; most springs have
                  no lifeguard. Never enter caves or caverns without cave-diving certification.
                </p>
                <p>
                  LakeLens is <span className="font-bold">not affiliated with Florida State Parks</span>, the
                  Florida Department of Environmental Protection, Alachua County or Ginnie Springs Outdoors.
                  Official information always takes precedence over anything shown here.
                </p>
              </Card>
            </Section>

            <Section id="team" title="About the team" icon={<Heart />}>
              <Card className="space-y-3">
                <p>
                  LakeLens was built at <span className="font-bold">SASEhack 2026</span> (September 18 to 20,
                  2026). It brings honest, accessible conditions at a glance to Florida&rsquo;s freshwater
                  swim areas: the springs, lakes and rivers inside the state parks that fill to capacity
                  before mid-morning on a summer weekend.
                </p>
                <p className="text-sm text-mocha">
                  Tracks: Social Impact and Best Design. Built with Next.js, Supabase, MapLibre and a lot of
                  iced coffee.
                </p>
              </Card>
            </Section>

            <Section id="roadmap" title="Roadmap" icon={<Rocket />}>
              <Card>
                <ol className="relative space-y-4 border-l-2 border-mist pl-5">
                  <li>
                    <span
                      aria-hidden="true"
                      className="absolute -left-[9px] mt-1 size-4 rounded-full bg-taupe"
                    />
                    <p className="font-bold">Now: Florida springs and state-park swim areas</p>
                    <p className="text-sm text-mocha">
                      Seven parks with deep coverage, dozens more with the basics, live USGS and weather
                      feeds.
                    </p>
                  </li>
                  <li>
                    <span
                      aria-hidden="true"
                      className="absolute -left-[9px] mt-1 size-4 rounded-full bg-moss"
                    />
                    <p className="font-bold">Next: Florida lakes and rivers</p>
                    <p className="text-sm text-mocha">
                      Boat ramps, blue-green algae advisories and river stage warnings across the state.
                    </p>
                  </li>
                  <li>
                    <span
                      aria-hidden="true"
                      className="absolute -left-[9px] mt-1 size-4 rounded-full bg-lagoon"
                    />
                    <p className="font-bold">Then: the Great Lakes</p>
                    <p className="text-sm text-mocha">
                      Rip-current and water-quality data for the busiest beaches.
                    </p>
                  </li>
                  <li>
                    <span
                      aria-hidden="true"
                      className="absolute -left-[9px] mt-1 size-4 rounded-full bg-mist"
                    />
                    <p className="font-bold">Later: nationwide</p>
                    <p className="text-sm text-mocha">
                      Any public freshwater swim area with an open data source.
                    </p>
                  </li>
                </ol>
                <div className="mt-4 flex flex-wrap gap-2">
                  <ButtonLink href="/">
                    <WavesLadder aria-hidden="true" />
                    Open the map
                  </ButtonLink>
                  <Link
                    href="/list"
                    className="inline-flex min-h-11 items-center rounded-full px-4 font-bold text-brown underline decoration-moss decoration-2 underline-offset-4"
                  >
                    Browse the list
                  </Link>
                </div>
              </Card>
            </Section>
          </div>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
