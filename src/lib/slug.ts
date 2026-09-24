/**
 * Teacher public-page slugs. The dynamic `[teacherSlug]` route only catches
 * paths that don't match a real folder, but we guard against the reserved set
 * anyway so a future route can never collide with a teacher's page.
 */

export const RESERVED_SLUGS = new Set([
  "courses", "login", "signup", "account", "library", "adminpanel",
  "api", "_next", "images", "public", "favicon.ico", "t", "teacher", "admin",
  "quizzes", "clerk", "sign-in", "sign-up", "og-image.jpeg", "robots.txt", "sitemap.xml",
  "faq", "privacy", "terms", "plans", "curriculum", "payment-methods", "payment",
  "environments", "leaderboard", "parent", "student", "center", "llms.txt",
  "llms-full.txt", "geo-keywords.txt", "about", "qureo", "teachers",
]);

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\-؀-ۿ]/g, "") // latin, digits, hyphen, Arabic
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function isValidSlug(slug: string): boolean {
  return slug.length >= 2 && slug.length <= 40 && !RESERVED_SLUGS.has(slug.toLowerCase());
}
