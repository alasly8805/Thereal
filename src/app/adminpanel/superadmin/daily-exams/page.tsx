import { redirect } from "next/navigation";

// Daily exams are managed inside the superadmin panel (section "daily-exams").
// This standalone list linked to an /edit page that never existed.
export default function AdminDailyExamsPage() {
  redirect("/adminpanel/superadmin?section=daily-exams");
}
