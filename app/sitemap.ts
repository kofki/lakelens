import type { MetadataRoute } from "next";
import { getParkSlugs } from "@/lib/queries";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://lakelens-kenzo-fukudas-projects.vercel.app";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${APP_URL}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${APP_URL}/list`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${APP_URL}/report`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${APP_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];
  let slugs: string[] = [];
  try {
    slugs = await getParkSlugs();
  } catch {
    slugs = [];
  }
  return [
    ...staticRoutes,
    ...slugs.map((slug) => ({
      url: `${APP_URL}/park/${slug}`,
      lastModified: now,
      changeFrequency: "hourly" as const,
      priority: 0.8,
    })),
  ];
}
