"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { cn } from "@/components/ui/cn";

export interface SectionLink {
  id: string;
  label: string;
}

export interface SectionTabsProps {
  sections: SectionLink[];
  className?: string;
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Height of the page above the content that the tabs bar covers when stuck (top nav + bar). */
function stuckOffset(nav: HTMLElement | null): number {
  if (!nav) return 0;
  const top = Number.parseFloat(getComputedStyle(nav).top) || 0;
  return top + nav.offsetHeight;
}

/**
 * Sticky in-page section tabs. Phones get a horizontally scrolling pill row; md+ gets
 * evenly spread tabs with a 3px underline on the active one. The active section is
 * tracked with an IntersectionObserver against a band just below the bar; the current
 * tab carries aria-current="location" so the highlight is never colour alone.
 */
export function SectionTabs({ sections, className }: SectionTabsProps) {
  const [active, setActive] = useState<string | null>(sections[0]?.id ?? null);
  const navRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const ids = sections.map((s) => s.id).join(",");

  // Observe the sections and pick the first (in page order) that crosses the band under the bar.
  useEffect(() => {
    const list = ids.split(",").filter(Boolean);
    const els = list.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    if (els.length === 0 || typeof IntersectionObserver === "undefined") return;

    const visible = new Set<string>();
    const offset = Math.round(stuckOffset(navRef.current));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        const next = list.find((id) => visible.has(id));
        if (next) setActive(next);
      },
      { rootMargin: `-${offset}px 0px -55% 0px`, threshold: 0 },
    );
    els.forEach((el) => io.observe(el));

    // At the very bottom of the page the last section may never enter the band.
    const onScroll = () => {
      const doc = document.documentElement;
      if (window.innerHeight + window.scrollY >= doc.scrollHeight - 2) setActive(list[list.length - 1]);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [ids]);

  // Keep the active pill in view when the row scrolls horizontally (phones).
  useEffect(() => {
    const list = listRef.current;
    if (!list || !active || list.scrollWidth <= list.clientWidth) return;
    const el = list.querySelector<HTMLElement>(`[data-section="${active}"]`);
    if (!el) return;
    const left = el.offsetLeft - (list.clientWidth - el.offsetWidth) / 2;
    list.scrollTo({ left: Math.max(0, left), behavior: reducedMotion() ? "auto" : "smooth" });
  }, [active]);

  function jump(e: MouseEvent<HTMLAnchorElement>, id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    const top = el.getBoundingClientRect().top + window.scrollY - stuckOffset(navRef.current) - 12;
    window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? "auto" : "smooth" });
    window.history.replaceState(null, "", `#${id}`);
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
    setActive(id);
  }

  if (sections.length === 0) return null;

  return (
    <nav
      ref={navRef}
      aria-label="Sections"
      className={cn(
        "sticky top-0 z-30 -mx-4 border-b border-mist bg-cream/95 backdrop-blur md:top-[var(--top-nav-h)] md:mx-0",
        className,
      )}
    >
      <ul
        ref={listRef}
        className="flex gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none] md:gap-0 md:overflow-visible md:px-0 md:py-0 [&::-webkit-scrollbar]:hidden"
      >
        {sections.map((s) => {
          const isActive = s.id === active;
          return (
            <li key={s.id} className="shrink-0 md:flex-1">
              <a
                href={`#${s.id}`}
                data-section={s.id}
                aria-current={isActive ? "location" : undefined}
                onClick={(e) => jump(e, s.id)}
                className={cn(
                  "inline-flex min-h-11 items-center whitespace-nowrap rounded-full border px-4 text-sm font-bold transition-colors",
                  "md:min-h-12 md:w-full md:justify-center md:rounded-none md:border-x-0 md:border-t-0 md:border-b-[3px] md:bg-transparent md:px-2 md:text-[0.88rem]",
                  isActive
                    ? "border-brown bg-brown text-white md:border-b-taupe md:text-brown"
                    : "border-mist bg-white text-cocoa hover:border-moss md:border-b-transparent md:text-mocha md:hover:bg-mist/30 md:hover:text-brown",
                )}
              >
                {s.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
