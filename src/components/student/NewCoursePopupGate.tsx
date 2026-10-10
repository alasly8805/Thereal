import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { NewCoursePopup } from "./NewCoursePopup";

/**
 * Mounts the new-course big notification popup for signed-in students only.
 * Reads the JWT directly from cookies (no DB hit) on each page load.
 */
export default async function NewCoursePopupGate() {
  const token = (await cookies()).get("auth_token")?.value;
  if (!token) return null;

  const payload = await verifyToken(token).catch(() => null);
  if (!payload || payload.role !== "student" || payload.supportView) return null;

  return <NewCoursePopup />;
}
