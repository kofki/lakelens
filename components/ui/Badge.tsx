import type { ReactNode } from "react";
import {
  BadgeCheck,
  CircleHelp,
  FlaskConical,
  Info,
  ShieldCheck,
  Timer,
  TriangleAlert,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "./cn";

export type BadgeVariant =
  | "user"
  | "verified"
  | "sample"
  | "typical"
  | "unverified"
  | "official"
  | "info"
  | "warning";

export interface BadgeProps {
  variant: BadgeVariant;
  /** Overrides the default label for the variant. */
  children?: ReactNode;
  className?: string;
}

/* Spring-forest provenance tints. Every text/fill pair is >= 4.5:1:
 * verified 8.3, sample 5.2 (cyan-deep on aqua),
 * unverified 11 (cocoa on mist), official 9.6 (white on forest). */
const META: Record<BadgeVariant, { label: string; icon: LucideIcon; classes: string }> = {
  user: { label: "User reported", icon: Users, classes: "bg-mist-light text-brown border-mist" },
  verified: { label: "Verified", icon: BadgeCheck, classes: "bg-status-open-bg text-status-open border-status-open-edge/50" },
  sample: { label: "Sample data", icon: FlaskConical, classes: "bg-aqua text-cyan-deep border-dashed border-cyan-deep/50" },
  typical: { label: "Typical", icon: Timer, classes: "bg-white text-mocha border-mist" },
  unverified: { label: "Unverified", icon: CircleHelp, classes: "bg-mist text-cocoa border-dashed border-mocha" },
  official: { label: "Official", icon: ShieldCheck, classes: "bg-brown text-white border-brown" },
  info: { label: "Info", icon: Info, classes: "bg-aqua/60 text-cyan-deep border-aqua" },
  warning: { label: "Warning", icon: TriangleAlert, classes: "bg-status-likely-bg text-status-likely border-status-likely-edge/50" },
};

/** Small labelled pill: icon + text, used to mark provenance (user / verified / sample / estimate ...). */
export function Badge({ variant, children, className }: BadgeProps) {
  const meta = META[variant];
  const Icon = meta.icon;
  return (
    <span
      data-variant={variant}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold leading-tight",
        meta.classes,
        className,
      )}
    >
      <Icon aria-hidden="true" focusable="false" className="size-3.5 shrink-0" strokeWidth={2.25} />
      <span>{children ?? meta.label}</span>
    </span>
  );
}
