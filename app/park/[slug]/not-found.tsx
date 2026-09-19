import { MapPinOff } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";

export default function ParkNotFound() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-10">
      <EmptyState
        icon={<MapPinOff aria-hidden="true" focusable="false" />}
        title="We don't know that park"
        body="It may have moved, or we haven't added it yet. Browse the full list instead."
        action={<ButtonLink href="/list">See all parks</ButtonLink>}
      />
    </div>
  );
}
