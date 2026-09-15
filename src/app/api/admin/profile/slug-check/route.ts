import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import { slugify, isValidSlug } from "@/lib/slug";

export async function GET(req: NextRequest) {
  try {
  const session = await getSession();
  if (!session || !isTeacherLike(session.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const raw = req.nextUrl.searchParams.get("slug") ?? "";
  const slug = slugify(raw);
  if (!isValidSlug(slug)) {
    return NextResponse.json({ slug, available: false, reason: "invalid" });
  }
  const taken = await prisma.teacherProfile.findFirst({
    where: { slug, NOT: { teacherId: actingTeacherId(session) } },
    select: { id: true },
  });
  return NextResponse.json({ slug, available: !taken });
} catch (error) {
    console.error("[admin/profile/slug-check] error:", error);
    return NextResponse.json(
      { error: "حدث خطأ داخلي" },
      { status: 500 }
    );
  }
}
