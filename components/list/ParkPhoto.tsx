import { Waves } from "lucide-react";
import { cn } from "@/components/ui/cn";

export interface ParkPhotoProps {
  src: string | null;
  /** Empty by default: the park name is always adjacent, so the photo is decorative. */
  alt?: string;
  className?: string;
}

/** Park photo or a brand-coloured placeholder. Plain <img>: photo hosts vary per park. */
export function ParkPhoto({ src, alt = "", className }: ParkPhotoProps) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote/local photo hosts vary per park; next/image needs remotePatterns
      <img src={src} alt={alt} loading="lazy" decoding="async" className={cn("object-cover", className)} />
    );
  }
  return (
    <div
      aria-hidden="true"
      className={cn("flex items-center justify-center bg-linear-to-br from-aqua to-mist text-cyan-deep/70", className)}
    >
      <Waves focusable="false" className="size-8" />
    </div>
  );
}
