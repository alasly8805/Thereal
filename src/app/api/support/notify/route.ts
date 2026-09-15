import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSupportSession, logSupportAction } from "@/lib/support-auth";

const MAX_TITLE = 120;
const MAX_BODY = 1000;

/**
 * POST /api/support/notify
 * Body: { studentId, title, body, link? }
 *
 * Drops a message into the student's in-app notification bell — the missing
 * half of every support fix: "we added the views / fixed your phone number /
 * opened the lesson, try now". The student sees it on their next page load;
 * nothing is emailed or texted.
 *
 * The row is a plain Notification with type "support_message", which the bell
 * renders like any other type. Every send is audit-logged.
 */
export async function POST(req: NextRequest) {
  const support = await getSupportSession();
  if (!support) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    studentId?: string;
    title?: string;
    body?: string;
    link?: string;
  };

  const studentId = String(body.studentId || "").trim();
  const title = String(body.title || "").trim().slice(0, MAX_TITLE);
  const text = String(body.body || "").trim().slice(0, MAX_BODY);
  // Only in-app links — an absolute URL here would let a hijacked session send
  // students to a phishing lookalike from a trusted bell icon.
  const rawLink = String(body.link || "").trim();
  const link = rawLink.startsWith("/") && !rawLink.startsWith("//") ? rawLink.slice(0, 200) : null;

  if (!studentId || !title || !text) {
    return NextResponse.json({ error: "الطالب والعنوان ونص الرسالة مطلوبة" }, { status: 400 });
  }

  const student = await prisma.user.findFirst({
    where: { id: studentId, role: "student", isDeleted: false },
    select: { id: true, name: true },
  });
  if (!student) return NextResponse.json({ error: "الطالب غير موجود" }, { status: 404 });

  try {
    await prisma.notification.create({
      data: { userId: studentId, type: "support_message", title, body: text, link },
    });

    await logSupportAction({
      action: "SUPPORT_SEND_NOTIFICATION",
      targetType: "student",
      targetId: studentId,
      targetName: student.name,
      metadata: { agent: support.agent, title, body: text, link },
    });

    return NextResponse.json({ ok: true, message: "تم إرسال الإشعار للطالب" });
  } catch (err) {
    console.error("support notify failed:", err);
    return NextResponse.json({ error: "تعذر إرسال الإشعار" }, { status: 500 });
  }
}
