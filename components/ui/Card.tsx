import type { ReactNode } from "react";
import { cn } from "./cn";

export interface CardProps {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
  /** Default true: 16px inner padding. */
  padded?: boolean;
  /** Lifts the card on hover/focus-within (use on cards that are links or selectable). */
  interactive?: boolean;
}

/** White card, 20px radius, sage hairline border, soft forest shadow. */
export function Card({ children, className, as: Tag = "div", padded = true, interactive = false }: CardProps) {
  return (
    <Tag
      className={cn(
        "rounded-card border border-mist-light bg-white shadow-card",
        interactive && "transition-shadow hover:shadow-card-hover focus-within:shadow-card-hover",
        padded && "p-4",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
