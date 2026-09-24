import { NextResponse } from "next/server";
import { applyPhoneVisibility } from "@/lib/teacher-scope";
import { requireTeacherContext } from "@/lib/teacher-scope-server";
import { buildTeacherRoster } from "@/lib/teacher-roster";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireTeacherContext("canViewStudents");
  if (!gate.ok) return gate.response;

  try {
    const roster = await buildTeacherRoster(gate.ctx.teacherId);
    if (!roster) {
      return NextResponse.json({ error: "المعلم غير موجود" }, { status: 404 });
    }

    const canSeePhones = gate.ctx.permissions.viewStudentPhones;
    return NextResponse.json({
      ...roster,
      students: roster.students.map((s) =>
        applyPhoneVisibility(s as unknown as Record<string, unknown>, canSeePhones, ["phone", "parentPhone"])
      ),
    });
  } catch (error) {
    console.error("[teacher/roster GET] error:", error);
    return NextResponse.json({ error: "تعذر تحميل قائمة الطلاب والأرقام" }, { status: 500 });
  }
}
