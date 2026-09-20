"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Megaphone } from "lucide-react";
import { Wordmark } from "@/components/ui/Logo";
import { cn } from "@/components/ui/cn";

interface NavItem {
  href: "/" | "/list" | "/report" | "/about";
  label: string;
}

const LINKS: NavItem[] = [
  { href: "/", label: "Map" },
  { href: "/list", label: "Explore parks" },
  { href: "/report", label: "Report" },
  { href: "/about", label: "About" },
];

function isActive(href: NavItem["href"], pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Desktop header (md+ only; BottomNav takes over below md). Fixed to the top, height
 * --top-nav-h (nav.css); app/layout.tsx pads <main> by the same amount on md+.
 * Wordmark left, centred links, outline and filled CTAs right.
 * The active link is marked with aria-current plus an amber underline, never colour alone.
 * Hover text is sunset-deep (5:1 on ivory); plain sunset fails AA as text.
 */
export function TopNav() {
  const pathname = usePathname() ?? "/";
  return (
    <header
      className={cn(
        "top-nav fixed inset-x-0 top-0 z-50 hidden md:block",
        "border-b border-mist bg-cream/95 shadow-nav backdrop-blur-md",
      )}
    >
      <nav
        aria-label="Primary"
        className="relative flex min-h-[var(--top-nav-h)] items-center justify-between px-6 lg:px-8"
      >
        <Link
          href="/"
          aria-label="LakeLens home"
          className="inline-flex min-h-11 items-center rounded-full pr-2 focus-visible:outline-offset-4"
        >
          <Wordmark />
        </Link>

        <ul className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 lg:gap-2">
          {LINKS.map(({ href, label }) => {
            const active = isActive(href, pathname);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-full px-3 text-[0.95rem] font-bold text-brown transition-colors hover:text-sunset-deep",
                    active && "underline decoration-sunset decoration-[3px] underline-offset-8",
                  )}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-3">
          <Link
            href="/list"
            className="hidden min-h-11 items-center justify-center rounded-full border-2 border-brown px-5 text-[0.95rem] font-bold text-brown transition-colors hover:bg-brown hover:text-white xl:inline-flex"
          >
            Explore parks
          </Link>
          <Link
            href="/report"
            className="hidden min-h-11 items-center justify-center gap-2 rounded-full lg:inline-flex bg-brown px-5 text-[0.95rem] font-bold text-white transition-colors hover:bg-brown-deep"
          >
            <Megaphone aria-hidden="true" focusable="false" className="size-5 shrink-0" strokeWidth={2.25} />
            Report conditions
          </Link>
        </div>
      </nav>
    </header>
  );
}
