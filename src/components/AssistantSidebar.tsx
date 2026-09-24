"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AssistantPermissions } from "@/lib/teacher-scope";

export function AssistantSidebar({
  permissions,
}: {
  permissions: AssistantPermissions;
}) {
  if (!permissions.canViewStudents) return null;

  return (
    <nav className="grid grid-cols-2 gap-2" dir="rtl">
      <StudentReportsLinks />
    </nav>
  );
}

export function StudentReportsLinks({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const links = [
    { href: "/teacher/students", label: "الطلاب", hint: "قائمة الطلاب" },
    { href: "/teacher/reports", label: "التقارير", hint: "تقارير الأداء" },
  ];

  return (
    <>
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`min-h-12 rounded-2xl px-3 py-2 text-center text-sm font-black ${
              active ? "bg-[var(--brand)] text-white" : "bg-[var(--surface-2)] text-[var(--ink-2)]"
            } ${className}`}
          >
            {link.label}
          </Link>
        );
      })}
    </>
  );
}
