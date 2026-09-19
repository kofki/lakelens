/**
 * Ambient declaration so `import "server-only"` typechecks without installing the npm package.
 * Next.js (webpack and Turbopack) aliases "server-only" to its bundled copy
 * (next/dist/compiled/server-only), so no runtime dependency is needed.
 * If the real `server-only` package is ever installed, its own types take precedence.
 */
declare module "server-only";
