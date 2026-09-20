import type { Park, ParkStatus } from "@/lib/types";

export interface ParkJsonLdProps {
  park: Park;
  status: ParkStatus;
  /** Absolute site origin, e.g. https://lakelens.example — used to build absolute URLs. */
  origin: string;
}

function absolute(origin: string, path: string): string {
  return path.startsWith("http") ? path : `${origin.replace(/\/$/, "")}${path}`;
}

/**
 * Structured data for a park page.
 *
 * Two graphs: the park itself as a TouristAttraction (Google understands geo, image and
 * publicAccess on it) and a BreadcrumbList so the SERP shows Home › Parks › Name.
 *
 * Only facts the page itself states go in here — no closure estimate, because that is a
 * prediction that changes hourly and ISR would serve a stale one as if it were structured
 * fact. `publicAccess` reflects the current status, which is sourced, not guessed.
 */
export function ParkJsonLd({ park, status, origin }: ParkJsonLdProps) {
  const url = absolute(origin, `/park/${park.slug}`);
  const graph: Record<string, unknown>[] = [
    {
      "@type": "TouristAttraction",
      "@id": `${url}#attraction`,
      name: park.name,
      url,
      description: park.description ?? `Status, parking, accessibility and safety information for ${park.name}.`,
      ...(park.photo_url ? { image: absolute(origin, park.photo_url) } : {}),
      geo: { "@type": "GeoCoordinates", latitude: park.lat, longitude: park.lng },
      address: { "@type": "PostalAddress", addressRegion: "FL", addressCountry: "US" },
      ...(park.official_url ? { sameAs: [park.official_url] } : {}),
      ...(park.hours ? { openingHours: park.hours } : {}),
      isAccessibleForFree: park.fees === null,
      publicAccess: status.level !== "closed",
      touristType: "Swimming",
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumbs`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "LakeLens", item: absolute(origin, "/") },
        { "@type": "ListItem", position: 2, name: "All parks", item: absolute(origin, "/list") },
        { "@type": "ListItem", position: 3, name: park.name, item: url },
      ],
    },
  ];
  return (
    <script
      type="application/ld+json"
      // The payload is built from our own typed rows, so JSON.stringify is the whole escape
      // story; "<" is replaced so a name containing it can never close the script tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c") }}
    />
  );
}
