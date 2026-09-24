import { NextRequest, NextResponse } from "next/server";
import { requireTeacherContext } from "@/lib/teacher-scope-server";
import { getTeacherStudentReport } from "@/lib/teacher-student-reports";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireTeacherContext("canViewStudents");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  try {
    const report = await getTeacherStudentReport(
      gate.ctx.teacherId,
      id,
      gate.ctx.permissions.viewStudentPhones
    );
    if (!report) {
      return NextResponse.json({ error: "الطالب غير موجود أو ليس لديه اشتراك مدفوع فعال" }, { status: 404 });
    }
    return NextResponse.json(report);
  } catch (error) {
    console.error("[teacher/students/:id GET] error:", error);
    return NextResponse.json({ error: "تعذر تحميل تقرير الطالب" }, { status: 500 });
  }
}
