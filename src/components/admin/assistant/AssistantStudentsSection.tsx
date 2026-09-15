"use client";

import { useEffect, useState } from "react";
import { StudentPhoneActions } from "@/components/admin/StudentPhoneActions";
import { StudentDossierButton } from "@/components/admin/TeacherStudentDossierModal";

type Course = { id: string; title: string };
type Student = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  isActive?: boolean;
};

export function AssistantStudentsSection({
  canSeePhones,
}: {
  canSeePhones: boolean;
}) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/courses", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        const list = (data.courses || []) as Course[];
        setCourses(list);
        if (list[0]?.id) setCourseId(list[0].id);
      })
      .catch(() => setError("تعذر تحميل الكورسات"))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!courseId) {
      setStudents([]);
      return;
    }
    let alive = true;
    setLoading(true);
    fetch(`/api/admin/students?courseId=${encodeURIComponent(courseId)}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        if (data.error) {
          setError(data.error);
          setStudents([]);
          return;
        }
        setError("");
        setStudents(data.students || []);
      })
      .catch(() => setError("تعذر تحميل الطلاب"))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [courseId]);

  return (
    <div className="space-y-4">
      <select
        value={courseId}
        onChange={(e) => setCourseId(e.target.value)}
        className="w-full min-h-12 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold"
      >
        {courses.length === 0 && <option value="">لا توجد كورسات</option>}
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </select>

      {error && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
          {error}
        </div>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-[var(--ink-3)]">جارٍ التحميل...</p>
      ) : students.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-[var(--border)] py-12 text-center text-sm text-[var(--ink-3)]">
          مفيش طلاب في الكورس ده
        </p>
      ) : (
        <ul className="space-y-3">
          {students.map((s) => (
            <li
              key={s.id}
              className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-black">{s.name}</p>
                  <p className="mt-1 truncate text-xs text-[var(--ink-3)]">{s.email}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-black ${
                    s.isActive ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/10 text-rose-500"
                  }`}
                >
                  {s.isActive ? "نشط" : "موقوف"}
                </span>
              </div>
              <div className="mt-3">
                {canSeePhones ? (
                  <StudentPhoneActions phone={s.phone} />
                ) : (
                  <p className="text-xs text-[var(--ink-3)]">الأرقام مخفية حسب صلاحياتك</p>
                )}
              </div>
              <div className="mt-3 flex">
                <StudentDossierButton studentId={s.id} courseId={courseId} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
