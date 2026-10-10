import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { StudentPollPrompt } from "./StudentPollPrompt";

/**
 * Mounts the poll prompt for signed-in students only. Runs in the root layout
 * on every page, so it reads the JWT directly (no DB) like SupportViewBanner.
 */
export default async function StudentPollGate() {
  const token = (await cookies()).get("auth_token")?.value;
  if (!token) return null;

  const payload = await verifyToken(token).catch(() => null);
  if (!payload || payload.role !== "student" || payload.supportView) return null;

  return <StudentPollPrompt />;
}
