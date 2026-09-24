import { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

const baseUrl = "https://code-up.tech";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Dynamic: published courses (prefer the SEO slug, fall back to id).
  let courses: { id: string; slug: string | null; updatedAt: Date }[] = [];
  try {
    courses = await prisma.course.findMany({
      // baseUrl is the online site, so never advertise centre-only courses here —
      // otherwise Google indexes them and online students land on centre content.
      where: {
        teacher: { isDeleted: false, isDemo: false },
        deliveryMode: { in: ["ONLINE", "BOTH"] },
      },
      select: { id: true, slug: true, updatedAt: true },
    });
  } catch (error) {
    console.error("Failed to fetch courses for sitemap", error);
  }

  const courseUrls: MetadataRoute.Sitemap = courses.map((c) => ({
    url: `${baseUrl}/courses/${c.slug ?? c.id}`,
    lastModified: c.updatedAt ?? now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  // Dynamic: public teacher profile landing pages
  let teacherProfiles: { slug: string; updatedAt: Date }[] = [];
  try {
    teacherProfiles = await prisma.teacherProfile.findMany({
      where: { teacher: { isDeleted: false, isDemo: false } },
      select: { slug: true, updatedAt: true },
    });
  } catch (error) {
    console.error("Failed to fetch teacher profiles for sitemap", error);
  }

  const teacherUrls: MetadataRoute.Sitemap = teacherProfiles
    .filter((p) => Boolean(p.slug))
    .map((p) => ({
      url: `${baseUrl}/${p.slug}`,
      lastModified: p.updatedAt ?? now,
      changeFrequency: "daily",
      priority: 0.9,
    }));

  // Dynamic: published learning plans
  let plans: { id: string; updatedAt: Date }[] = [];
  try {
    plans = await prisma.plan.findMany({
      where: { status: "published" },
      select: { id: true, updatedAt: true },
    });
  } catch (error) {
    console.error("Failed to fetch plans for sitemap", error);
  }

  const planUrls: MetadataRoute.Sitemap = plans.map((p) => ({
    url: `${baseUrl}/plans/${p.id}`,
    lastModified: p.updatedAt ?? now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  // Public static routes. The /adminpanel area is intentionally EXCLUDED — those
  // are private, auth-gated pages and must not be advertised to crawlers.
  const staticRoutes = ([
    { url: baseUrl, changeFrequency: "daily", priority: 1.0 },
    { url: `${baseUrl}/about`, changeFrequency: "monthly", priority: 1.0 },
    { url: `${baseUrl}/qureo`, changeFrequency: "monthly", priority: 1.0 },
    { url: `${baseUrl}/teachers`, changeFrequency: "daily", priority: 0.95 },
    { url: `${baseUrl}/curriculum`, changeFrequency: "weekly", priority: 1.0 },
    { url: `${baseUrl}/curriculum/programming-and-ai`, changeFrequency: "weekly", priority: 1.0 },
    { url: `${baseUrl}/courses`, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/plans`, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/leaderboard`, changeFrequency: "daily", priority: 0.8 },
    { url: `${baseUrl}/payment-methods`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${baseUrl}/faq`, changeFrequency: "weekly", priority: 0.95 },
    { url: `${baseUrl}/llms.txt`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/llms-full.txt`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${baseUrl}/geo-keywords.txt`, changeFrequency: "monthly", priority: 0.2 },
    { url: `${baseUrl}/environments`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/environments/programming`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/environments/programming/python`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/environments/programming/javascript`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/environments/programming/html-css-js`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/environments/chemistry`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${baseUrl}/login`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${baseUrl}/signup`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${baseUrl}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${baseUrl}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ] as const).map((r) => ({ ...r, lastModified: now })) as MetadataRoute.Sitemap;

  return [...staticRoutes, ...teacherUrls, ...courseUrls, ...planUrls];
}
