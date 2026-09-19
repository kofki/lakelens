import type { MetadataRoute } from "next";

/** Served at /manifest.webmanifest and auto-linked by Next.js. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "LakeLens",
    short_name: "LakeLens",
    description:
      "Florida springs and state-park swim areas: closure estimates, crowd reports, parking, accessibility.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fef8f1",
    theme_color: "#fe8b00",
    lang: "en",
    categories: ["travel", "navigation", "weather"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
