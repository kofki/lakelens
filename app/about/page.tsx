import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  CalendarDays,
  CloudRain,
  Compass,
  Database,
  ExternalLink,
  Gauge,
  Heart,
  Megaphone,
  Scale,
  ShieldCheck,
  Sun,
  ThermometerSun,
  TriangleAlert,
  Users,
  WavesLadder,
} from "lucide-react";
import { STATUS_META, STATUS_ORDER } from "@/lib/status";
import { REPORT_VALUES, REPORT_VALUE_LABELS, type ReportCategory } from "@/lib/types";
import { ReportIcon } from "@/components/report/ReportIcon";
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
    "How LakeLens estimates how busy a park will be, how crowd reports work, what is verified, and where the data comes from.",
  alternates: { canonical: "/about" },
};

const TOC: { id: string; label: string }[] = [
  { id: "what", label: "What LakeLens does" },
  { id: "estimate", label: "How busy today?" },
  { id: "reports", label: "How reports work" },
  { id: "verified", label: "What we verify" },
  { id: "sources", label: "Data sources" },
  { id: "disclaimer", label: "Rules and disclaimer" },
  { id: "maker", label: "Who made this" },
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
    what:
      "Hourly and 7-day forecasts, active weather alerts, and the raw gridpoint values behind feels-like temperature and thunder chance.",
    licence: "U.S. public domain.",
  },
  {
    name: "EPA Envirofacts UV Index",
    href: "https://data.epa.gov/",
    what: "Hourly UV index for each park's coordinates.",
    licence: "U.S. public domain.",
  },
  {
    name: "NOAA CO-OPS Tides & Currents",
    href: "https://tidesandcurrents.noaa.gov/",
    what: "Water temperature from fixed stations, including the Great Lakes.",
    licence: "U.S. public domain. Readings are preliminary.",
  },
  {
    name: "FDEP algal bloom sampling",
    href: "https://floridadep.gov/AlgalBloom",
    what: "Freshwater cyanobacteria (blue-green algae) sample results near parks.",
    licence: "U.S. public domain. Samples are point-in-time, not a live reading.",
  },
  {
    name: "Nager.Date",
    href: "https://date.nager.at/",
    what: "US public holidays and long weekends used by the busyness score.",
    licence: "Open API (MIT-licensed project).",
  },
  {
    name: "OpenStreetMap contributors / OpenFreeMap",
    href: "https://openfreemap.org/",
    what: "Base map tiles, parking-lot locations and park amenities.",
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
            Check the water before you drive.
          </h1>
          <p className="max-w-prose text-mocha md:text-lg">
            LakeLens covers freshwater swim areas across all 50 states: springs, lakes and rivers inside
            public land. It tells you what is known about a place before you drive out, and says nothing
            when nothing is known.
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
                    <span className="font-bold">How busy today.</span> A transparent score for whether a park
                    is running busier than usual, and roughly when the crowds arrive.
                  </li>
                  <li>
                    <span className="font-bold">Hours you can trust.</span> Opening hours and sunset are
                    worked out per park in its own time zone, so a park shut for the night says so.
                  </li>
                  <li>
                    <span className="font-bold">One-tap crowd reports.</span> Got in, turned away, line at the
                    gate, lot full. No account needed. When a park is full, the nearest open alternatives.
                  </li>
                  <li>
                    <span className="font-bold">Conditions, parking and access.</span> Water temperature, UV,
                    feels-like and the forecast, plus water entry type, ADA parking, restrooms and amenities.
                  </li>
                  <li>
                    <span className="font-bold">Silence where we have nothing.</span> Most lakes here were
                    found by their public shore and have no posted hours or lifeguard. Those get no status at
                    all, rather than a badge implying we checked.
                  </li>
                </ul>
                <p className="text-sm text-mocha">
                  Where there is a status, it is an icon plus words, never a colour on its own:
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

            <Section id="estimate" title="How busy today?" icon={<Gauge />}>
              <Card className="space-y-4">
                <p className="text-sm text-mocha">
                  Parks never publish live capacity, so we score the day instead. We never claim a park will
                  fill; at most we say it is busier than usual. Each park starts at zero:
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
                <p className="text-sm text-mocha">
                  0 or less is a normal day. 1 to 2 is somewhat busier. 3 or more means go early. Parks with a
                  known typical busy time also get a time, which moves 25 minutes earlier for every point
                  above 2.
                </p>
                <p className="rounded-xl bg-aqua p-3 text-sm text-cyan-deep">
                  A park is only marked <strong>Full</strong> or <strong>Closed</strong> once it has actually
                  stopped letting people in: an official closure, the park&rsquo;s own hours, the swim season,
                  or visitors reporting they were turned away. An active closure or a gate shut for the night
                  always wins over the score, and the park reopens by itself when the notice ends.
                </p>
              </Card>
            </Section>

            <Section id="reports" title="How reports work" icon={<Megaphone />}>
              <Card className="space-y-3">
                <ul className="list-disc space-y-2 pl-5">
                  <li>
                    <span className="font-bold">One tap, no account.</span> Pick what you saw. Your device
                    gets a random ID so we can rate-limit without knowing who you are.
                  </li>
                  <li>
                    <span className="font-bold">Reports expire after 2 hours.</span> Conditions change fast,
                    so stale reports would mislead.
                  </li>
                  <li>
                    <span className="font-bold">3 matching reports in 30 minutes = confirmed.</span> One
                    &ldquo;turned away&rdquo; shows as <Badge variant="user">Reported</Badge>; three makes it{" "}
                    <Badge variant="verified">Confirmed</Badge>, which overrides the outlook. When a full
                    status is over 30 minutes old, people at the park are asked whether it is still true.
                  </li>
                  <li>
                    <span className="font-bold">Contradictions are shown, not hidden.</span> A newer
                    &ldquo;got in&rdquo; after a &ldquo;turned away&rdquo; lowers our confidence and both stay
                    visible.
                  </li>
                </ul>
                <p className="text-sm font-bold text-mocha">The things you can report:</p>
                <ul className="flex flex-wrap gap-2">
                  {(Object.keys(REPORT_VALUES) as ReportCategory[]).flatMap((category) =>
                    REPORT_VALUES[category].map((v) => (
                      <li
                        key={v}
                        className="inline-flex items-center gap-1.5 rounded-full border border-mist bg-white px-3 py-1 text-sm font-bold text-cocoa"
                      >
                        <ReportIcon value={v} className="size-4 shrink-0 text-taupe" />
                        {REPORT_VALUE_LABELS[v]}
                      </li>
                    )),
                  )}
                </ul>
                <ButtonLink href="/report" variant="secondary">
                  <Megaphone aria-hidden="true" />
                  Send a report
                </ButtonLink>
              </Card>
            </Section>

            <Section id="verified" title="What we verify" icon={<ShieldCheck />}>
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
                      Stated on the park&rsquo;s official page, with a link to the source.
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
                    <dt className="shrink-0 sm:w-40">
                      <Badge variant="unverified" />
                    </dt>
                    <dd className="text-sm text-mocha">
                      OpenStreetMap details, accessibility we could not confirm, and anything a visitor
                      reported.
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
                    <dt className="shrink-0 sm:w-40">
                      <Badge variant="typical" />
                    </dt>
                    <dd className="text-sm text-mocha">
                      Values like &ldquo;spring water is typically 72&deg;F&rdquo; when there is no live
                      gauge. Never presented as a live reading.
                    </dd>
                  </div>
                </dl>
                <p className="flex items-start gap-2 rounded-xl bg-peach p-3 text-sm text-cocoa">
                  <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-cocoa" />
                  <span>
                    <span className="font-bold">Lifeguards:</span> most freshwater swim areas have none. We
                    show &ldquo;yes&rdquo;, &ldquo;no&rdquo; or nothing at all; assume no.
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
                Each number shows where it came from and when it was fetched. Water data older than 6 hours,
                forecasts older than 3 hours and reports older than 2 hours are flagged as possibly out of
                date. Park photos come from Wikimedia Commons, with the photographer and licence under every
                photo.
              </p>
            </Section>

            <Section id="disclaimer" title="Rules and disclaimer" icon={<Scale />}>
              <Card className="space-y-2 text-sm">
                <p>
                  LakeLens is <span className="font-bold">informational only</span>. The busyness outlook is
                  an estimate, visitor reports are unverified, and conditions change quickly. Always follow
                  posted rules, signs and park staff. Swim at your own risk, and never enter caves or caverns
                  without cave-diving certification.
                </p>
                <p>
                  Park rules vary by operator. Florida State Parks follow{" "}
                  <ExtLink href="https://flrules.elaws.us/fac/62d-2.014">F.A.C. 62D-2.014</ExtLink>: no
                  alcohol outside designated areas, and no pets in swimming areas. Each park page lists its
                  own rules where we have them.
                </p>
                <p>
                  LakeLens is <span className="font-bold">not affiliated with any park operator</span> or
                  state agency. Official information always takes precedence over anything shown here.
                </p>
              </Card>
            </Section>

            <Section id="maker" title="Who made this" icon={<Heart />}>
              <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <Image
                  src="/kenzo-fukuda.jpg"
                  alt="Kenzo Fukuda"
                  width={96}
                  height={96}
                  className="size-24 shrink-0 rounded-full object-cover shadow-card"
                />
                <p className="min-w-0">
                  Made by <span className="font-bold">Kenzo Fukuda</span>, CS student at the University of
                  Florida.
                </p>
              </Card>
              <div className="flex flex-wrap gap-2">
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
            </Section>
          </div>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
