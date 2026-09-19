import type { ReactNode } from "react";
import { cn } from "./cn";

export interface CardProps {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
  /** Default true: 16px inner padding. */
  padded?: boolean;
}

/** White card, 1rem radius, soft shadow (BeachLens family). */
export function Card({ children, className, as: Tag = "div", padded = true }: CardProps) {
  return (
    <Tag className={cn("rounded-card border border-mist/60 bg-white shadow-card", padded && "p-4", className)}>
      {children}
    </Tag>
  );
}
