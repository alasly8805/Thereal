import { NextResponse } from "next/server";
import { requireTeacherContext } from "@/lib/teacher-scope-server";
import { getTeacherReports } from "@/lib/teacher-student-reports";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireTeacherContext("canViewStudents");
  if (!gate.ok) return gate.response;

  try {
    const reports = await getTeacherReports(gate.ctx.teacherId, gate.ctx.permissions.viewStudentPhones);
    return NextResponse.json(reports);
  } catch (error) {
    console.error("[teacher/reports GET] error:", error);
    return NextResponse.json({ error: "تعذر تحميل التقارير" }, { status: 500 });
  }
}
