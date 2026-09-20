import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      // Supabase Storage (report photos) and any project subdomain.
      { protocol: "https", hostname: "**.supabase.co" },
      // Wikimedia Commons park photos (attribution shown next to each image).
      { protocol: "https", hostname: "upload.wikimedia.org" },
    ],
  },
  async headers() {
    return [
      {
        // Baseline hardening for every response. No CSP yet: MapLibre needs blob: workers
        // and the tile/style hosts, so a wrong one would break the map silently.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Geolocation stays enabled: "parks near me" depends on it.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), interest-cohort=()" },
        ],
      },
      {
        // Park photos are content-addressed by slug and only change when we replace the
        // file, so they can be cached hard instead of revalidated on every card render.
        source: "/photos/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=2592000, stale-while-revalidate=86400" }],
      },
      {
        // The service worker must never be served from a stale cache.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
