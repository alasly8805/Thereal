"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import {
  AssistantShell,
  assistantNavItems,
  type AssistantSection,
} from "@/components/admin/assistant/AssistantShell";
import { AssistantStudentsSection } from "@/components/admin/assistant/AssistantStudentsSection";
import { HomeworkManagerSection, LiveReviewPanel } from "@/components/admin/TeacherHomeworkComponents";
import { TeacherRequests } from "@/components/admin/TeacherRequests";
import { TeacherQuizResults } from "@/components/admin/TeacherQuizResults";
import { InVideoResponsesSection } from "@/components/admin/InVideoResponsesSection";
import { TeacherFeedback } from "@/components/admin/TeacherFeedback";
import {
  DEFAULT_ASSISTANT_PERMISSIONS,
  type AssistantPermissions,
} from "@/lib/teacher-scope";

type Course = { id: string; title: string };

export default function AssistantPanelPage() {
  const router = useRouter();
  const { success: toastSuccess, error: toastError } = useToast();
  const [name, setName] = useState("المساعد");
  const [teacherName, setTeacherName] = useState("");
  const [perms, setPerms] = useState<AssistantPermissions>(DEFAULT_ASSISTANT_PERMISSIONS);
  const [active, setActive] = useState<AssistantSection>("home");
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [ready, setReady] = useState(false);

  const notify = (type: "success" | "error", text: string) => {
    if (type === "success") toastSuccess(text);
    else toastError(text);
  };

  const load = useCallback(async () => {
    const [meRes, coursesRes] = await Promise.all([
      fetch("/api/auth/me", { credentials: "include" }),
      fetch("/api/admin/courses", { credentials: "include" }),
    ]);
    const me = await meRes.json().catch(() => null);
    const role = me?.user?.role;
    if (role === "teacher") {
      router.replace("/adminpanel/teacher");
      return;
    }
    if (role !== "assistant") {
      router.replace("/adminpanel");
      return;
    }
    setName(me.user.name || "المساعد");
    setPerms(me.user.assistantPermissions || DEFAULT_ASSISTANT_PERMISSIONS);
    const courseData = await coursesRes.json().catch(() => ({}));
    const list = (courseData.courses || []) as Course[];
    setCourses(list);
    setSelectedCourse(list[0] || null);
    const teacher = courseData.teacherName || courseData.courses?.[0]?.teacherName;
    if (typeof teacher === "string") setTeacherName(teacher);
    setReady(true);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo(() => assistantNavItems(perms), [perms]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/adminpanel");
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--ink-3)]" dir="rtl">
        جارٍ فتح لوحة المساعد...
      </div>
    );
  }

  return (
    <AssistantShell
      name={name}
      teacherName={teacherName}
      items={items}
      active={active}
      onSelect={setActive}
      onLogout={() => void logout()}
    >
      {active === "home" && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <p className="text-lg font-black">أهلاً {name}</p>
            <p className="mt-2 text-sm leading-7 text-[var(--ink-3)]">
              دي لوحة المساعد — مش لوحة المدرّس. هتلاقي هنا بس اللي المدرّس سمّحلك تعمله.
            </p>
          </div>
          {items.length === 0 ? (
            <p className="rounded-3xl border border-dashed border-[var(--border)] py-12 text-center text-sm text-[var(--ink-3)]">
              مفيش صلاحيات مفعّلة. كلم المدرّس يفعّل لك مهام من المساعدون.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActive(item.id)}
                  className="min-h-[6.5rem] rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 text-right shadow-sm"
                >
                  <p className="text-2xl">{item.icon}</p>
                  <p className="mt-2 text-base font-black">{item.label}</p>
                  <p className="mt-1 text-xs leading-6 text-[var(--ink-3)]">{item.hint}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {active === "review" && <LiveReviewPanel notify={notify} />}
      {active === "homework" && (
        <HomeworkManagerSection
          courses={courses}
          folders={[]}
          selectedCourse={selectedCourse}
          onSelectCourse={setSelectedCourse}
          notify={notify}
        />
      )}
      {active === "students" && <AssistantStudentsSection canSeePhones={perms.viewStudentPhones} />}
      {active === "quiz-results" && <TeacherQuizResults />}
      {active === "essay-grading" && <InVideoResponsesSection />}
      {active === "requests" && <TeacherRequests key="assistant-requests" initialTab="views" />}
      {active === "tickets" && <TeacherRequests key="assistant-tickets" initialTab="tickets" />}
      {active === "feedback" && <TeacherFeedback />}
    </AssistantShell>
  );
}
