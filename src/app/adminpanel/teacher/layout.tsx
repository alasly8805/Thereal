import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function TeacherPanelLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/adminpanel");
  if (session.role === "assistant") redirect("/adminpanel/assistant");
  if (session.role !== "teacher") redirect("/adminpanel");
  return children;
}
