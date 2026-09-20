import { Accessibility, Car, ExternalLink, Navigation, SquareParking, TriangleAlert } from "lucide-react";
import type { Park, ParkingLot } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";
import { MiniMapLazy } from "@/components/map/MiniMapLazy";
import { directionsUrl } from "./format";

export interface ParkingCardProps {
  park: Park;
  lots: ParkingLot[];
}

const ROADSIDE_RE = /roadside|no waiting|not wait|do not wait|don't wait|queue on the road|line up on/i;

export function mentionsNoRoadsideWaiting(park: Park, lots: ParkingLot[]): boolean {
  if (park.entrance_notes && ROADSIDE_RE.test(park.entrance_notes)) return true;
  return lots.some((l) => l.notes && ROADSIDE_RE.test(l.notes));
}

/** Curated parking lots with fee / ADA spaces / overflow / notes, a mini map and a directions link. */
export function ParkingCard({ park, lots }: ParkingCardProps) {
  const sorted = [...lots].sort((a, b) => Number(a.is_overflow) - Number(b.is_overflow));
  const roadside = mentionsNoRoadsideWaiting(park, lots);

  return (
    <Section
      id="parking"
      title="Parking"
      icon={<SquareParking />}
      action={
        <a
          href={directionsUrl(park.lat, park.lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1 rounded-full border border-mist bg-white px-3 text-sm font-bold text-brown shadow-card hover:border-moss"
        >
          <Navigation aria-hidden="true" focusable="false" className="size-4" />
          Directions
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      }
    >
      {roadside && (
        <div role="note" className="flex gap-2 rounded-card border border-status-full-edge/40 bg-status-full-bg p-3 text-sm text-status-full">
          <TriangleAlert aria-hidden="true" focusable="false" className="mt-0.5 size-5 shrink-0" />
          <p>
            <strong>No roadside waiting.</strong> When the lot is full, rangers turn cars away. Do not queue on the road. Try a
            backup park instead.
          </p>
        </div>
      )}

      {sorted.length === 0 ? (
        park.entrance_notes ? (
          <Card>
            <p className="text-sm text-cocoa">{park.entrance_notes}</p>
          </Card>
        ) : null
      ) : (
        <ul className={sorted.length > 1 ? "space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0" : "space-y-3"}>
          {sorted.map((lot) => (
            <li key={lot.id}>
              <Card as="article" className="h-full space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="flex items-center gap-1.5 font-extrabold text-ink">
                    <Car aria-hidden="true" focusable="false" className="size-4 text-taupe" />
                    {lot.name}
                  </h3>
                  {lot.is_overflow && <Badge variant="info">Overflow lot</Badge>}
                  {lot.source === "curated" ? (
                    <Badge variant="verified">Curated</Badge>
                  ) : (
                    <Badge variant="unverified">OpenStreetMap, unverified</Badge>
                  )}
                </div>
                {/* Only facts we have. A lot with no recorded fee shows no fee row. */}
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  {lot.fee && (
                    <>
                      <dt className="text-mocha">Fee</dt>
                      <dd className="font-bold text-cocoa">{lot.fee}</dd>
                    </>
                  )}
                  {lot.capacity != null && (
                    <>
                      <dt className="text-mocha">Spaces</dt>
                      <dd className="font-bold text-cocoa">about {lot.capacity}</dd>
                    </>
                  )}
                  {lot.ada_spaces != null && (
                    <>
                      <dt className="flex items-center gap-1 text-mocha">
                        <Accessibility aria-hidden="true" focusable="false" className="size-3.5" />
                        ADA spaces
                      </dt>
                      <dd className="font-bold text-cocoa">{lot.ada_spaces}</dd>
                    </>
                  )}
                </dl>
                {lot.notes && <p className="text-sm text-cocoa">{lot.notes}</p>}
              </Card>
            </li>
          ))}
        </ul>
      )}

      {park.entrance_notes && sorted.length > 0 && (
        <p className="text-sm text-cocoa">
          <strong>Getting in:</strong> {park.entrance_notes}
        </p>
      )}

      <div className="lg:hidden">
        <MiniMapLazy center={{ lat: park.lat, lng: park.lng }} parkName={park.name} lots={sorted} className="w-full overflow-hidden rounded-card" />
      </div>

      {park.official_url && (
        <p className="text-xs text-mocha">
          Parking details entered by hand from the park&apos;s website.{" "}
          <a href={park.official_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-brown underline underline-offset-2">
            Official site
            <ExternalLink aria-hidden="true" focusable="false" className="size-3" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </p>
      )}
    </Section>
  );
}
