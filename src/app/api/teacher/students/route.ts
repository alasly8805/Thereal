import { NextResponse } from "next/server";
import { requireTeacherContext } from "@/lib/teacher-scope-server";
import { listTeacherStudents } from "@/lib/teacher-student-reports";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireTeacherContext("canViewStudents");
  if (!gate.ok) return gate.response;

  try {
    const students = await listTeacherStudents(gate.ctx.teacherId, gate.ctx.permissions.viewStudentPhones);
    return NextResponse.json({ students });
  } catch (error) {
    console.error("[teacher/students GET] error:", error);
    return NextResponse.json({ error: "تعذر تحميل الطلاب" }, { status: 500 });
  }
}
