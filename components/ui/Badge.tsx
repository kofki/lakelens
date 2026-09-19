import type { ReactNode } from "react";
import {
  BadgeCheck,
  CircleDashed,
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
  | "estimate"
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

const META: Record<BadgeVariant, { label: string; icon: LucideIcon; classes: string }> = {
  user: { label: "User reported", icon: Users, classes: "bg-aqua text-cocoa border-aqua" },
  verified: { label: "Verified", icon: BadgeCheck, classes: "bg-status-open/10 text-status-open border-status-open/30" },
  sample: { label: "Sample data", icon: FlaskConical, classes: "bg-peach/50 text-cocoa border-dashed border-sunset/60" },
  estimate: { label: "Estimate", icon: CircleDashed, classes: "bg-mist/60 text-cocoa border-mist" },
  typical: { label: "Typical", icon: Timer, classes: "bg-white text-cocoa border-mist" },
  unverified: { label: "Unverified", icon: CircleHelp, classes: "bg-white text-cocoa border-dashed border-taupe" },
  official: { label: "Official", icon: ShieldCheck, classes: "bg-cocoa text-cream border-cocoa" },
  info: { label: "Info", icon: Info, classes: "bg-aqua/60 text-cocoa border-aqua" },
  warning: { label: "Warning", icon: TriangleAlert, classes: "bg-status-likely/10 text-status-likely border-status-likely/30" },
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
