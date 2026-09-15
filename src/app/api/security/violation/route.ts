import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { whatsappOrchestrator } from "@/lib/whatsapp/orchestrator";

interface RateRecord {
  count: number;
  resetAt: number;
}

const violationRateMap = new Map<string, RateRecord>();
const lastParentAlertByStudent = new Map<string, number>();

const RATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_VIOLATIONS_PER_WINDOW = 10;
const PARENT_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

function checkViolationRateLimit(key: string): boolean {
  const now = Date.now();
  const record = violationRateMap.get(key);

  if (!record || now > record.resetAt) {
    violationRateMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }

  if (record.count >= MAX_VIOLATIONS_PER_WINDOW) {
    return false;
  }

  record.count += 1;
  return true;
}

function shouldSendParentAlert(studentId: string): boolean {
  const now = Date.now();
  const lastAlert = lastParentAlertByStudent.get(studentId) || 0;
  if (now - lastAlert < PARENT_ALERT_COOLDOWN_MS) {
    return false;
  }
  lastParentAlertByStudent.set(studentId, now);
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !session.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "127.0.0.1";

    // Rate Limiting (10 violation reports per 5 minutes per student/IP)
    const rateLimitKey = `${session.id}:${ip}`;
    if (!checkViolationRateLimit(rateLimitKey)) {
      return NextResponse.json(
        { error: "تم إرسال عدد كبير من البلاغات في وقت قصير. يرجى الانتظار." },
        { status: 429 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      type?: string;
      videoId?: string;
      details?: string;
    };

    if (!body?.type) {
      return NextResponse.json({ error: "نوع المخالفة مطلوب" }, { status: 400 });
    }

    // Preview mode check: If not a regular student (e.g. teacher previewing or testing),
    // do not persist violations to the Student table
    if (session.role && session.role !== "student") {
      return NextResponse.json({ success: true, preview: true, count: 0 });
    }

    const { type, videoId, details } = body;
    const userAgent = req.headers.get("user-agent") || undefined;

    await prisma.securityViolation.create({
      data: {
        studentId: session.id,
        videoId: videoId || null,
        type,
        details: details || null,
        ip,
        userAgent,
      },
    });

    // Check violation count for student in last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentViolations = await prisma.securityViolation.count({
      where: {
        studentId: session.id,
        createdAt: { gte: twentyFourHoursAgo },
      },
    });

    // Notify parent via WhatsApp on threshold (e.g. 3, 6, 9 violations) with 6h cooldown
    if (recentViolations >= 3 && recentViolations % 3 === 0 && shouldSendParentAlert(session.id)) {
      const student = await prisma.user.findUnique({
        where: { id: session.id },
        select: { name: true, parentPhone: true, role: true },
      });

      if (student?.role === "student" && student?.parentPhone) {
        const alertMsg = `⚠️ تنبيه أمني عاجل من منصة Code-UP:\n\nنسترعي انتباهكم بأنه تم رصد محاولات متكررة لتصوير الشاشة أو فتح أدوات المطور (DevTools) أثناء مشاهدة الفيديوهات على حساب نجلك (${student.name}).\n\nيرجى التنبيه عليه لمنع حظر الحساب نهائياً من متابعة الدروس.`;

        whatsappOrchestrator
          .sendMessage({
            recipient: student.parentPhone,
            messageType: "NOTIFICATION",
            content: alertMsg,
          })
          .catch(() => {});
      }
    }

    return NextResponse.json({ success: true, count: recentViolations });
  } catch (error: any) {
    console.error("Failed to log security violation:", error);
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}

