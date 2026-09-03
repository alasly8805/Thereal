import { NextRequest, NextResponse } from "next/server";
import { getSession, getStudentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { checkCourseEnrollment } from "@/lib/authorization";

// POST — student creates a support ticket
export async function POST(req: NextRequest) {
  try {
    const session = await getStudentSession();
    if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

    const { title, description, type, priority, courseId } = await req.json();
    if (!title || !description) {
      return NextResponse.json({ error: "العنوان والوصف مطلوبان" }, { status: 400 });
    }
    if (typeof title !== "string" || typeof description !== "string" || title.length > 200 || description.length > 5000) {
      return NextResponse.json({ error: "العنوان أو الوصف طويل جداً" }, { status: 400 });
    }
    // Clamp priority to a known set so a crafted value can't sort above real
    // urgent tickets; unknown values fall back to the caller's intent as "normal".
    const safePriority = ["low", "normal", "high", "urgent"].includes(String(priority)) ? String(priority) : "normal";

    if (courseId) {
      const isEnrolled = await checkCourseEnrollment(session.id, courseId);
      if (!isEnrolled) {
        return NextResponse.json({ error: "غير مسجل في هذا الكورس" }, { status: 403 });
      }
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        studentId: session.id,
        courseId: courseId ?? null,
        title,
        description,
        type: type || "other",
        priority: safePriority,
        status: "open",
      },
    });

    return NextResponse.json({ ticket, message: "تم إنشاء التذكرة بنجاح" });
  } catch (err) {
    console.error("Tickets POST error:", err);
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 });
  }
}

// GET — list tickets (student: own; teacher: their courses; admin: all)
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

    const status = req.nextUrl.searchParams.get("status");

    if (session.role === "student") {
      const tickets = await prisma.supportTicket.findMany({
        where: {
          studentId: session.id,
          ...(status ? { status } : {}),
        },
        orderBy: { createdAt: "desc" },
        include: { course: { select: { title: true } } },
      });
      return NextResponse.json({ tickets });
    }

    if (session.role === "teacher") {
      const courses = await prisma.course.findMany({
        where: { teacherId: session.id },
        select: { id: true },
      });
      const tickets = await prisma.supportTicket.findMany({
        where: {
          courseId: { in: courses.map((c) => c.id) },
          ...(status ? { status } : {}),
        },
        orderBy: { createdAt: "desc" },
        include: {
          student: { select: { name: true, phone: true } },
          course: { select: { title: true } },
        },
      });
      return NextResponse.json({ tickets });
    }

    if (session.role === "superadmin" || session.role === "admin") {
      const tickets = await prisma.supportTicket.findMany({
        where: status ? { status } : {},
        orderBy: { createdAt: "desc" },
        include: {
          student: { select: { name: true, phone: true } },
          course: { select: { title: true } },
        },
      });
      return NextResponse.json({ tickets });
    }

    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  } catch (err) {
    console.error("Tickets GET error:", err);
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 });
  }
}
