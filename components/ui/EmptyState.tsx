import type { ReactNode } from "react";
import { cn } from "./cn";

export interface EmptyStateProps {
  title: string;
  body?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Friendly "nothing here" card with an optional action. */
export function EmptyState({ title, body, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-card border border-mist-light bg-white p-6 text-center shadow-card",
        className,
      )}
    >
      {icon && (
        <div aria-hidden="true" className="inline-flex text-taupe [&>svg]:size-8">
          {icon}
        </div>
      )}
      <p className="font-extrabold text-ink">{title}</p>
      {body && <p className="max-w-prose text-sm text-mocha">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
