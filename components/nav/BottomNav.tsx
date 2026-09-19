"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Info, List, Map as MapIcon, Megaphone, type LucideIcon } from "lucide-react";
import { cn } from "@/components/ui/cn";

interface Tab {
  href: "/" | "/list" | "/report" | "/about";
  label: string;
  icon: LucideIcon;
}

const TABS: Tab[] = [
  { href: "/", label: "Map", icon: MapIcon },
  { href: "/list", label: "List", icon: List },
  { href: "/report", label: "Report", icon: Megaphone },
  { href: "/about", label: "About", icon: Info },
];

function isActive(href: Tab["href"], pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Fixed bottom tab bar (Map / List / Report / About), mobile only: hidden on md+ where
 * TopNav takes over. Height = --bottom-nav-h (nav.css) plus the iOS safe area. Active tab
 * is marked with aria-current, a peach icon pill and heavier text, never colour alone.
 */
export function BottomNav() {
  const pathname = usePathname() ?? "/";
  return (
    <nav
      aria-label="Primary (mobile)"
      className="bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-mist bg-white/95 backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex h-[var(--bottom-nav-h)] max-w-2xl items-stretch">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href, pathname);
          return (
            <li key={href} className="min-w-0 flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg text-xs leading-none",
                  active ? "font-extrabold text-cocoa" : "font-bold text-cocoa/75 hover:text-cocoa",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                    active ? "bg-peach" : "bg-transparent",
                  )}
                >
                  <Icon
                    aria-hidden="true"
                    focusable="false"
                    strokeWidth={active ? 2.5 : 2}
                    className={cn("size-5", active ? "text-cocoa" : "text-mocha")}
                  />
                </span>
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
