import { cn } from "./cn";

/** Inline LakeLens mark (water drop + waves). Same art as public/icons/logo.svg. */
export function Logo({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={cn("size-10 shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : "true"}
      focusable="false"
    >
      {title && <title>{title}</title>}
      <rect width="512" height="512" rx="112" fill="#fef8f1" />
      <path d="M256 64c-48 70-100 130-100 192a100 100 0 0 0 200 0c0-62-52-122-100-192z" fill="#fe8b00" />
      <path d="M214 268a42 42 0 0 0 26 40" fill="none" stroke="#feca8a" strokeWidth="16" strokeLinecap="round" />
      <path
        d="M40 400c36-28 72-28 108 0s72 28 108 0 72-28 108 0 72 28 108 0"
        fill="none"
        stroke="#17e0ee"
        strokeWidth="26"
        strokeLinecap="round"
      />
      <path
        d="M40 452c36-28 72-28 108 0s72 28 108 0 72-28 108 0 72 28 108 0"
        fill="none"
        stroke="#cbeaed"
        strokeWidth="22"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Logo + "LakeLens" wordmark. */
export function Wordmark({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Logo className={size === "lg" ? "size-12" : "size-8"} />
      <span
        className={cn(
          "font-extrabold tracking-tight text-cocoa",
          size === "lg" ? "text-3xl" : "text-xl",
        )}
      >
        Lake<span className="text-sunset">Lens</span>
      </span>
    </span>
  );
}
