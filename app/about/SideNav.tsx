"use client";

import { useEffect, useState } from "react";
import { cn } from "@/components/ui/cn";

export interface SideNavItem {
  id: string;
  label: string;
}

/**
 * Desktop "On this page" nav for /about. An IntersectionObserver tracks the section that
 * currently sits under the sticky top nav; that item gets aria-current="location" plus the
 * forest-green text and moss border, so the highlight is never colour alone.
 */
export function SideNav({ items }: { items: SideNavItem[] }) {
  const [active, setActive] = useState<string | null>(null);
  const ids = items.map((i) => i.id).join(",");

  useEffect(() => {
    const list = ids.split(",").filter(Boolean);
    const els = list.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    if (els.length === 0 || typeof IntersectionObserver === "undefined") return;

    const visible = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        const next = list.find((id) => visible.has(id));
        if (next) setActive(next);
      },
      { rootMargin: "-25% 0px -60% 0px", threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ids]);

  return (
    <ul className="space-y-0.5 border-l-2 border-mist">
      {items.map((t) => {
        const isActive = t.id === active;
        return (
          <li key={t.id}>
            <a
              href={`#${t.id}`}
              aria-current={isActive ? "location" : undefined}
              className={cn(
                "-ml-0.5 flex min-h-11 items-center border-l-2 pl-4 pr-2 text-sm font-bold transition-colors",
                isActive ? "border-taupe text-brown" : "border-transparent text-mocha hover:border-moss hover:text-brown",
              )}
            >
              {t.label}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
