import type { ReactNode } from "react";
import { cn } from "./cn";

export interface SectionProps {
  id: string;
  title: string;
  icon?: ReactNode;
  /** Right-aligned action (link or button) shown next to the heading. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** `<section aria-labelledby>` with an h2 heading, optional icon and action. */
export function Section({ id, title, icon, action, children, className }: SectionProps) {
  const headingId = `${id}-heading`;
  return (
    <section id={id} aria-labelledby={headingId} className={cn("scroll-mt-4 space-y-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id={headingId} className="flex items-center gap-2 text-lg font-extrabold leading-tight text-brown">
          {icon && (
            <span aria-hidden="true" className="shrink-0 text-taupe [&>svg]:size-5">
              {icon}
            </span>
          )}
          <span>{title}</span>
        </h2>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}
