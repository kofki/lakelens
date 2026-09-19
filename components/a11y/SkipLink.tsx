/** Visually hidden until focused; first tab stop on every page. Target must be focusable (main has tabIndex -1). */
export function SkipLink({ href = "#main" }: { href?: string }) {
  return (
    <a
      href={href}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-full focus:bg-brown focus:px-4 focus:font-bold focus:text-white focus:shadow-card"
    >
      Skip to main content
    </a>
  );
}
