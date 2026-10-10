import { redirect } from "next/navigation";

// Exams are created from the superadmin panel's "daily-exams" section.
export default function CreateDailyExamPage() {
  redirect("/adminpanel/superadmin?section=daily-exams");
}
