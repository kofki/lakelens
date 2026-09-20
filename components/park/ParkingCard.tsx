import { ExternalLink, Navigation, SquareParking, TriangleAlert } from "lucide-react";
import type { Park, ParkingLot } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";
import { ParkingMapLazy } from "@/components/map/ParkingMapLazy";
import { directionsUrl } from "@/components/map/directions";

export interface ParkingCardProps {
  park: Park;
  lots: ParkingLot[];
}

const ROADSIDE_RE = /roadside|no waiting|not wait|do not wait|don't wait|queue on the road|line up on/i;

export function mentionsNoRoadsideWaiting(park: Park, lots: ParkingLot[]): boolean {
  if (park.entrance_notes && ROADSIDE_RE.test(park.entrance_notes)) return true;
  return lots.some((l) => l.notes && ROADSIDE_RE.test(l.notes));
}

/**
 * Parking lots with fee, ADA spaces, overflow and notes, numbered to match the pins on the
 * map below. Each lot links to directions using its OWN coordinates: a park centroid can
 * be kilometres from the entrance you actually want, and for the island parks it is open
 * water.
 */
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
          href={directionsUrl(park.lat, park.lng, park.name)}
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

      {sorted.length > 0 && (
        <ParkingMapLazy center={{ lat: park.lat, lng: park.lng }} parkName={park.name} lots={sorted} className="w-full" />
      )}

      {/* No lot cards: every fact one carried now lives on the pin's detail card, and the
          map's own list is what renders for screen readers and without WebGL. A park with
          no lots at all still shows how to get in. */}
      {sorted.length === 0 && park.entrance_notes && (
        <Card>
          <p className="text-sm text-cocoa">{park.entrance_notes}</p>
        </Card>
      )}

      {park.entrance_notes && sorted.length > 0 && (
        <p className="text-sm text-cocoa">
          <strong>Getting in:</strong> {park.entrance_notes}
        </p>
      )}


      {park.official_url && (
        <p className="text-xs text-mocha">
          Tap a numbered pin for that lot&apos;s details and directions.{" "}
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
