import Image from "next/image";
import { Waves } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { canOptimizeImage } from "@/components/park/format";

export interface ParkPhotoProps {
  src: string | null;
  /** Empty by default: the park name is always adjacent, so the photo is decorative. */
  alt?: string;
  className?: string;
  /**
   * How large the photo is actually painted. "thumb" is the 80 to 96 px square on list rows
   * and the map preview card; "tile" is the 4:3 photo tile in the /list grid.
   * This only drives the intrinsic size and `sizes` hint: the className still controls layout.
   */
  variant?: "thumb" | "tile";
}

const VARIANTS = {
  // The source JPEGs are up to 700 kB each; without these the browser downloads the full
  // file to paint an 80 px square. next/image resizes at the CDN instead.
  thumb: { width: 192, height: 192, sizes: "96px" },
  tile: { width: 640, height: 480, sizes: "(min-width: 1024px) 360px, (min-width: 640px) 45vw, 90vw" },
} as const;

/** Park photo or a brand-coloured placeholder. */
export function ParkPhoto({ src, alt = "", className, variant = "thumb" }: ParkPhotoProps) {
  if (src) {
    const { width, height, sizes } = VARIANTS[variant];
    return (
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        loading="lazy"
        decoding="async"
        unoptimized={!canOptimizeImage(src)}
        className={cn("object-cover", className)}
      />
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
