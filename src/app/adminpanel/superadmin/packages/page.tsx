import { redirect } from "next/navigation";

export default function SuperadminPackagesPage({
  searchParams,
}: {
  searchParams?: { teacherId?: string; tab?: string };
}) {
  const teacherId = searchParams?.teacherId ? `&teacherId=${encodeURIComponent(searchParams.teacherId)}` : "";
  const tab = searchParams?.tab ? `&tab=${encodeURIComponent(searchParams.tab)}` : "";
  redirect(`/adminpanel/superadmin?section=teacher-packages${teacherId}${tab}`);
}
