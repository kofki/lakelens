import type { MetadataRoute } from "next";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://lakelens-kenzo-fukudas-projects.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/offline"] }],
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
