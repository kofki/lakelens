import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "lg";

interface VisualProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the container width. */
  full?: boolean;
}

/* Sunset orange fails 4.5:1 with white text, so primary buttons use cocoa text on orange
 * (~6:1). The global focus ring is orange too, so primary swaps it for cocoa. */
const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-sunset text-cocoa hover:brightness-95 active:brightness-90 focus-visible:outline-cocoa",
  secondary: "border border-mist bg-white text-cocoa shadow-card hover:bg-cream active:bg-mist/40",
  ghost: "bg-transparent text-cocoa hover:bg-mist/50 active:bg-mist/70",
  danger: "bg-status-full text-white hover:brightness-95 active:brightness-90 focus-visible:outline-cocoa",
};

const SIZE: Record<ButtonSize, string> = {
  md: "min-h-11 px-4 text-sm",
  lg: "min-h-12 px-6 text-base",
};

/** Shared classes so other components (e.g. `<summary>`) can look like a button. */
export function buttonClasses({ variant = "primary", size = "md", full = false }: VisualProps, className?: string) {
  return cn(
    "inline-flex select-none items-center justify-center gap-2 rounded-full font-bold leading-tight transition-[filter,background-color,color] disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-5 [&>svg]:shrink-0",
    VARIANT[variant],
    SIZE[size],
    full && "w-full",
    className,
  );
}

export type ButtonProps = VisualProps & ComponentProps<"button">;

export function Button({ variant, size, full, className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={buttonClasses({ variant, size, full }, className)} {...rest} />;
}

export type ButtonLinkProps = VisualProps & ComponentProps<typeof Link>;

/** Same look as Button, rendered as a next/link anchor. */
export function ButtonLink({ variant, size, full, className, ...rest }: ButtonLinkProps) {
  return <Link className={buttonClasses({ variant, size, full }, className)} {...rest} />;
}
