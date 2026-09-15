import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function SuperadminPanelLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/adminpanel");
  if (!["superadmin", "admin", "staff"].includes(session.role)) redirect("/adminpanel");
  return children;
}
