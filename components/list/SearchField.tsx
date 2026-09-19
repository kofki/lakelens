"use client";

import { Search } from "lucide-react";
import { cn } from "@/components/ui/cn";

export interface SearchFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

/** Name search with a visually hidden label and a decorative icon. */
export function SearchField({ id, value, onChange, className, placeholder = "Search parks" }: SearchFieldProps) {
  return (
    <div className={cn("relative", className)}>
      <label htmlFor={id} className="sr-only">
        Search parks by name
      </label>
      <Search
        aria-hidden="true"
        focusable="false"
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mocha"
      />
      <input
        id={id}
        type="search"
        inputMode="search"
        autoComplete="off"
        enterKeyHint="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 w-full rounded-full border border-mist bg-white pl-9 pr-3 text-base text-cocoa placeholder:text-mocha hover:border-sand"
      />
    </div>
  );
}
