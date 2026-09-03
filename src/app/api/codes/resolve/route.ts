import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawCode = searchParams.get("code")?.trim() || "";

    if (!rawCode || rawCode.length > 50) {
      return NextResponse.json({ error: "الكود مطلوب وغير صالح" }, { status: 400 });
    }

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const session = await getSession();

    // Prevent brute force enumerations using AccessCodeGuard
    const { AccessCodeGuard } = await import("@/services/security/AccessCodeGuard");
    const rateCheck = await AccessCodeGuard.verifyRateLimit(clientIp, session?.id || clientIp);
    if (!rateCheck.allowed) {
      await AccessCodeGuard.logAttempt({
        ip: clientIp,
        userId: session?.id,
        codeAttempted: rawCode,
        success: false,
      });
      return NextResponse.json(
        { error: `تم تجاوز عدد المحاولات المسموح بها. يرجى الانتظار ${rateCheck.lockTimeSeconds} ثانية قبل المحاولة مجدداً.` },
        { status: 429 }
      );
    }

    const normalizedCode = rawCode.toUpperCase();

    const accessCode = await prisma.accessCode.findFirst({
      where: {
        OR: [
          { code: normalizedCode },
          { code: rawCode },
          { code: normalizedCode.replace(/-/g, "") },
        ],
      },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            educationalStage: true,
            subject: true,
            thumbnailUrl: true,
            deliveryMode: true,
            teacher: {
              select: {
                id: true,
                name: true,
                teacherProfile: {
                  select: {
                    displayName: true,
                    photoUrl: true,
                  },
                },
              },
            },
          },
        },
        folder: { select: { id: true, name: true } },
        video: { select: { id: true, title: true } },
      },
    });

    if (!accessCode) {
      return NextResponse.json({
        valid: false,
        error: "الكود غير صحيح أو غير موجود",
      }, { status: 404 });
    }

    const teacherName =
      accessCode.course?.teacher?.teacherProfile?.displayName ||
      accessCode.course?.teacher?.name ||
      "المعلم";

    const isUsed = !!accessCode.studentId;
    const isMine = session ? accessCode.studentId === session.id : false;
    const isActive = accessCode.isActive;

    let scopeLabel = "الكورس بالكامل";
    if (accessCode.accessType === "FOLDER" && accessCode.folder) {
      scopeLabel = `فصل: ${accessCode.folder.name}`;
    } else if (accessCode.accessType === "VIDEO" && accessCode.video) {
      scopeLabel = `محاضرة: ${accessCode.video.title}`;
    }

    return NextResponse.json({
      valid: isActive && (!isUsed || isMine),
      isActive,
      isUsed,
      isMine,
      code: accessCode.code,
      accessType: accessCode.accessType,
      scopeLabel,
      courseId: accessCode.courseId,
      courseTitle: accessCode.course?.title || "كورس غير مسمى",
      subject: accessCode.course?.subject || "",
      educationalStage: accessCode.course?.educationalStage || "",
      thumbnailUrl: accessCode.course?.thumbnailUrl || null,
      deliveryMode: accessCode.course?.deliveryMode || "ONLINE",
      teacherName,
      teacherPhoto: accessCode.course?.teacher?.teacherProfile?.photoUrl || null,
    });
  } catch (error) {
    console.error("Resolve code error:", error);
    return NextResponse.json({ error: "تعذر فحص الكود الآن" }, { status: 500 });
  }
}
