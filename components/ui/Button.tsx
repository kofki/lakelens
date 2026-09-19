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

/* Spring-forest buttons (beachlens.net pill shapes). Primary is forest green with white
 * text (9.6:1); the global cyan focus ring reads on every variant. Sunlit amber is kept
 * for accents/active states because white-on-amber fails AA. */
const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-brown text-white hover:bg-brown-deep active:bg-brown-deep",
  secondary: "border-2 border-brown bg-white text-brown hover:bg-brown hover:text-white active:bg-brown-deep active:text-white",
  ghost: "bg-transparent text-brown hover:bg-mist-light active:bg-mist",
  danger: "bg-status-full text-white hover:brightness-95 active:brightness-90",
};

const SIZE: Record<ButtonSize, string> = {
  md: "min-h-11 px-4 text-sm",
  lg: "min-h-12 px-6 text-base",
};

/** Shared classes so other components (e.g. `<summary>`) can look like a button. */
export function buttonClasses({ variant = "primary", size = "md", full = false }: VisualProps, className?: string) {
  return cn(
    "inline-flex select-none items-center justify-center gap-2 rounded-full font-bold leading-tight transition-[filter,background-color,color,border-color] disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-5 [&>svg]:shrink-0",
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
