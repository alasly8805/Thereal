import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { hasAssistantPermission, isTeacherLike } from "@/lib/teacher-scope";

export default async function TeacherStudentsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/adminpanel");
  if (!isTeacherLike(session.role)) redirect("/adminpanel");
  if (session.role === "assistant" && !hasAssistantPermission(session, "canViewStudents")) {
    redirect("/adminpanel/assistant");
  }
  return children;
}
