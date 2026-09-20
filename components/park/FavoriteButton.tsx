"use client";

import { Bookmark } from "lucide-react";
import { toggleFavoriteSlug } from "@/lib/personal";
import { useFavorites } from "@/components/list/usePersonal";
import { cn } from "@/components/ui/cn";

export interface FavoriteButtonProps {
  slug: string;
  name: string;
  className?: string;
}

/**
 * Save a park.
 *
 * Kept in this browser. It costs nothing to use and asks for nothing, which is the point:
 * a prompt to sign in before you can remember a lake is how you end up remembering no
 * lakes.
 */
export function FavoriteButton({ slug, name, className }: FavoriteButtonProps) {
  const favorites = useFavorites();
  const saved = favorites.includes(slug);

  return (
    <button
      type="button"
      onClick={() => toggleFavoriteSlug(slug)}
      aria-pressed={saved}
      // The name is in the label because on a card this button is one of many, and "Save"
      // on its own tells a screen reader nothing about which park.
      aria-label={saved ? `Saved: ${name}. Tap to remove` : `Save ${name}`}
      className={cn(
        "flex min-h-11 min-w-11 items-center justify-center rounded-full transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-taupe",
        saved ? "text-forest hover:bg-moss-light" : "text-mocha hover:bg-mist-light",
        className,
      )}
    >
      <Bookmark aria-hidden="true" focusable="false" className={cn("size-5", saved && "fill-current")} />
    </button>
  );
}
