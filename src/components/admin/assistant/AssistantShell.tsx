"use client";

import { useMemo, type ReactNode } from "react";
import { LogOut } from "lucide-react";
import { DarkModeToggle } from "@/components/ui/DarkModeToggle";
import type { AssistantPermissions } from "@/lib/teacher-scope";

export type AssistantSection =
  | "home"
  | "review"
  | "homework"
  | "students"
  | "quiz-results"
  | "essay-grading"
  | "requests"
  | "tickets"
  | "feedback";

export type AssistantNavItem = {
  id: AssistantSection;
  label: string;
  hint: string;
  icon: string;
};

export function assistantNavItems(perms: AssistantPermissions): AssistantNavItem[] {
  const items: AssistantNavItem[] = [];
  if (perms.gradeHomework) {
    items.push({ id: "review", label: "تصحيح الواجبات", hint: "قبول أو رفض تسليمات الطلاب", icon: "📝" });
  }
  if (perms.manageHomework) {
    items.push({ id: "homework", label: "الواجبات", hint: "إنشاء واجبات رفع واختبارات", icon: "📚" });
  }
  if (perms.canViewStudents || perms.viewStudents) {
    items.push({ id: "students", label: "الطلاب", hint: "القائمة والأرقام حسب صلاحيتك", icon: "🎓" });
  }
  if (perms.viewQuizResults) {
    items.push({ id: "quiz-results", label: "نتائج الاختبارات", hint: "درجات الطلاب وعرض إجاباتهم", icon: "📊" });
  }
  if (perms.viewQuizResults || perms.gradeHomework) {
    items.push({
      id: "essay-grading",
      label: "تصحيح الأسئلة المقالية",
      hint: "الإجابات المقالية المعلقة في الاختبارات والفيديوهات",
      icon: "📝",
    });
  }
  if (perms.manageRequests) {
    items.push({ id: "requests", label: "الطلبات", hint: "مشاهدات ودرجات", icon: "📬" });
  }
  if (perms.manageTickets) {
    items.push({ id: "tickets", label: "التذاكر", hint: "استفسارات الطلاب", icon: "🎫" });
    items.push({ id: "feedback", label: "الملاحظات", hint: "تقييمات الطلاب", icon: "💬" });
  }
  return items;
}

export function AssistantShell({
  name,
  teacherName,
  items,
  active,
  onSelect,
  onLogout,
  children,
}: {
  name: string;
  teacherName?: string;
  items: AssistantNavItem[];
  active: AssistantSection;
  onSelect: (id: AssistantSection) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const title = useMemo(() => {
    if (active === "home") return "لوحة المساعد";
    return items.find((i) => i.id === active)?.label || "لوحة المساعد";
  }, [active, items]);

  const dock = items.slice(0, 3);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]" dir="rtl" style={{ fontFamily: "var(--font-body)" }}>
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-base font-black" style={{ fontFamily: "var(--font-head)" }}>
              {title}
            </p>
            <p className="truncate text-[11px] text-[var(--ink-3)]">
              {name}
              {teacherName ? ` · باسم ${teacherName}` : " · مساعد مدرّس"}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <DarkModeToggle />
            <button
              type="button"
              onClick={onLogout}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)]"
              aria-label="خروج"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-28 pt-5">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-[var(--border)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-3xl grid-cols-4 gap-1 px-2 py-2">
          <button
            type="button"
            onClick={() => onSelect("home")}
            className={`min-h-12 rounded-2xl text-xs font-black ${
              active === "home" ? "bg-[var(--brand)] text-white" : "text-[var(--ink-2)]"
            }`}
          >
            الرئيسية
          </button>
          {dock.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`min-h-12 rounded-2xl text-xs font-black ${
                active === item.id ? "bg-[var(--brand)] text-white" : "text-[var(--ink-2)]"
              }`}
            >
              {item.label.split(" ")[0]}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
