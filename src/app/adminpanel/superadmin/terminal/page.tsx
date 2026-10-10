import { redirect } from "next/navigation";

export default function AdminTerminalPage() {
  redirect("/adminpanel/superadmin?section=ai-terminal");
}
