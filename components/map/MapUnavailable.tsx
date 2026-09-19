import { MapPin } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

/** Plain-language fallback when the browser cannot run WebGL. The list has the same data. */
export function MapUnavailable() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-cream p-6">
      <EmptyState
        icon={<MapPin />}
        title="The map can't load on this device"
        body="Your browser doesn't support the graphics the map needs. The park list shows the same status, conditions and parking information."
        action={<ButtonLink href="/list">Open the park list</ButtonLink>}
      />
    </div>
  );
}
