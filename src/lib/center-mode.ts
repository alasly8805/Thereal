import type { NextRequest } from "next/server";

/** Course delivery scope: which of the two sites a course may appear on. */
export type DeliveryMode = "ONLINE" | "CENTER" | "BOTH";

/**
 * Which site a request belongs to.
 *
 * code-up.tech and center.code-up.tech share one database, one user base and one
 * deployment — there is no per-student "centre" flag anywhere. Course.deliveryMode
 * is the ONLY thing separating the two audiences, so this check is the boundary
 * and every public course read/write path has to apply it.
 */
export function isCenterRequest(req: NextRequest): boolean {
  return (
    isCenterHost(req.headers) ||
    req.nextUrl.searchParams.get("mode") === "center" ||
    req.cookies.get("center_mode")?.value === "1"
  );
}

/**
 * Header-only variant for Server Components, which have no NextRequest.
 * src/proxy.ts sets x-center-mode on centre traffic; Host is the fallback.
 *
 * Calling this from a page opts that page into dynamic rendering. That is
 * required for correctness here regardless: Next keys the ISR cache by path,
 * not by host, so a cached render made for one site can otherwise be served
 * to the other.
 */
export function isCenterHost(headerList: { get(name: string): string | null }): boolean {
  return (
    headerList.get("x-center-mode") === "1" ||
    (headerList.get("host") || "").startsWith("center.")
  );
}

/** Prisma `where` fragment limiting a course query to what this site may list. */
export function deliveryModeFilter(isCenter: boolean): { in: DeliveryMode[] } {
  return { in: isCenter ? ["CENTER", "BOTH"] : ["ONLINE", "BOTH"] };
}

/** True when a single course is allowed to appear on the given site. */
export function isCourseOnSite(deliveryMode: string | null | undefined, isCenter: boolean): boolean {
  const mode = (deliveryMode || "ONLINE").toUpperCase();
  return isCenter ? mode === "CENTER" || mode === "BOTH" : mode === "ONLINE" || mode === "BOTH";
}
