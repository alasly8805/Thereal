import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import { getPlanMonths } from "@/lib/subscription-terms";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (!isTeacherLike(session.role) && session.role !== "admin" && session.role !== "superadmin")) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const stage = searchParams.get("stage");
    const plan = searchParams.get("plan");
    const track = searchParams.get("track");
    const query = searchParams.get("q");

    const teacherId = session.id;

    const where: any = {
      teacherId,
      ...(isTeacherLike(session.role) ? { student: { accountMode: { not: "TESTER" } } } : {}),
    };

    if (stage) where.educationalStage = stage;
    if (plan) where.planType = plan;
    if (track) where.languageTrack = track;
    if (query) {
      where.OR = [
        { studentName: { contains: query, mode: "insensitive" } },
        { studentPhone: { contains: query, mode: "insensitive" } },
        { parentPhone: { contains: query, mode: "insensitive" } },
        { student: { name: { contains: query, mode: "insensitive" } } },
        { student: { email: { contains: query, mode: "insensitive" } } },
      ];
    }

    const subscriptions = await prisma.teacherSubscription.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            parentPhone: true,
            educationalStage: true,
            createdAt: true,
          },
        },
      },
    });

    return NextResponse.json({ subscriptions });
  } catch (error) {
    console.error("[teacher/subscriptions GET] error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء جلب المشتركين" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (!isTeacherLike(session.role) && session.role !== "admin" && session.role !== "superadmin")) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    // Refuse when session teacher is a demo account (unless superadmin)
    const teacherUser = await prisma.user.findUnique({
      where: { id: session.id },
      select: { isDemo: true, role: true },
    });
    if (teacherUser?.isDemo && session.role !== "superadmin") {
      return NextResponse.json({ error: "حساب تجريبي — لا يمكن تسجيل مشتركين يدويين" }, { status: 403 });
    }

    const { studentEmailOrPhone, planType, planLabel, educationalStage, languageTrack } = await req.json().catch(() => ({}));

    if (!studentEmailOrPhone || !planType) {
      return NextResponse.json({ error: "بيانات الطالب ونوع الباقة مطلوبة" }, { status: 400 });
    }

    const validPlanTypes = ["monthly", "termly", "yearly"];
    if (!validPlanTypes.includes(planType)) {
      return NextResponse.json({ error: "نوع الباقة غير صحيح" }, { status: 400 });
    }

    // Find student by email or phone (excluding testers from teacher discovery)
    const student = await prisma.user.findFirst({
      where: {
        ...(isTeacherLike(session.role) ? { accountMode: { not: "TESTER" } } : {}),
        OR: [
          { email: String(studentEmailOrPhone).trim().toLowerCase() },
          { phone: String(studentEmailOrPhone).trim() },
        ],
      },
    });

    if (!student) {
      return NextResponse.json({ error: "لم يتم العثور على طالب بهذا البريد أو الهاتف" }, { status: 404 });
    }

    const profile = await prisma.teacherProfile.findUnique({
      where: { teacherId: actingTeacherId(session) },
      select: { priceMonthly: true, priceTermly: true, priceYearly: true, stagePricing: true, priceLanguagesMonthly: true, priceLanguagesTermly: true, priceLanguagesYearly: true },
    });

    const months = getPlanMonths(planType);

    let subPrice = 0;
    if (planType === "monthly") subPrice = profile?.priceMonthly ?? 0;
    else if (planType === "termly") subPrice = profile?.priceTermly ?? 0;
    else if (planType === "yearly") subPrice = profile?.priceYearly ?? 0;

    // Stage pricing override if applicable
    const targetStage = educationalStage || student.educationalStage;
    let stageConfig: any = null;
    if (profile?.stagePricing) {
      try {
        const parsed = JSON.parse(profile.stagePricing);
        const stageKey =
          targetStage && parsed[targetStage]
            ? targetStage
            : parsed["sec_1"]
            ? "sec_1"
            : parsed["sec_2"]
            ? "sec_2"
            : Object.keys(parsed)[0];
        if (stageKey && parsed[stageKey]) {
          stageConfig = parsed[stageKey];
          const keyMap: Record<string, string> = {
            monthly: "priceMonthly",
            termly: "priceTermly",
            yearly: "priceYearly",
          };
          const stageVal = stageConfig[keyMap[planType]];
          if (typeof stageVal === "number" && stageVal > 0) {
            subPrice = stageVal;
          }
        }
      } catch {}
    }

    const isLanguages = languageTrack === "languages" || languageTrack === "english";
    let languageSurcharge = 0;
    if (isLanguages) {
      let langMonthly = stageConfig && typeof stageConfig.priceLanguagesMonthly === "number" ? stageConfig.priceLanguagesMonthly : (profile?.priceLanguagesMonthly ?? 0);
      let langTermly = stageConfig && typeof stageConfig.priceLanguagesTermly === "number" ? stageConfig.priceLanguagesTermly : (profile?.priceLanguagesTermly ?? 0);
      let langYearly = stageConfig && typeof stageConfig.priceLanguagesYearly === "number" ? stageConfig.priceLanguagesYearly : (profile?.priceLanguagesYearly ?? 0);

      if (planType === "monthly") languageSurcharge = langMonthly;
      else if (planType === "termly") languageSurcharge = langTermly;
      else if (planType === "yearly") languageSurcharge = langYearly;
    }
    subPrice += languageSurcharge;

    const trackedLang = isLanguages ? "languages" : "arabic";

    const labelMap: Record<string, string> = {
      monthly: `اشتراك شهري (${isLanguages ? "لغات" : "عربي"})`,
      termly: `اشتراك ترم كامل (${isLanguages ? "لغات" : "عربي"})`,
      yearly: `اشتراك سنوي (${isLanguages ? "لغات" : "عربي"})`,
    };

    // Calculate expiry extending from current active expiresAt
    const existingSub = await prisma.teacherSubscription.findUnique({
      where: {
        studentId_teacherId_planType: {
          studentId: student.id,
          teacherId: actingTeacherId(session),
          planType,
        },
      },
      select: { expiresAt: true, status: true },
    });

    const now = new Date();
    const baseDate =
      existingSub && existingSub.status === "active" && existingSub.expiresAt && existingSub.expiresAt > now
        ? existingSub.expiresAt
        : now;

    const expiresAt = new Date(baseDate);
    expiresAt.setMonth(expiresAt.getMonth() + months);

    const sub = await prisma.teacherSubscription.upsert({
      where: {
        studentId_teacherId_planType: {
          studentId: student.id,
          teacherId: actingTeacherId(session),
          planType,
        },
      },
      create: {
        studentId: student.id,
        teacherId: actingTeacherId(session),
        planType,
        planLabel: planLabel || labelMap[planType] || "اشتراك معلم",
        amount: subPrice,
        educationalStage: targetStage,
        languageTrack: trackedLang,
        studentName: student.name,
        studentPhone: student.phone,
        parentPhone: student.parentPhone,
        paymentSource: "MANUAL",
        status: "active",
        expiresAt,
      },
      update: {
        planLabel: planLabel || labelMap[planType] || "اشتراك معلم",
        amount: subPrice,
        educationalStage: targetStage,
        languageTrack: trackedLang,
        studentName: student.name,
        studentPhone: student.phone,
        parentPhone: student.parentPhone,
        paymentSource: "MANUAL",
        status: "active",
        expiresAt,
      },
    });

    // Write audit log entry
    const { logAdminAction } = await import("@/lib/admin-auth");
    await logAdminAction({
      adminId: session.id,
      adminName: session.name,
      action: "MANUAL_TEACHER_SUBSCRIPTION",
      targetType: "STUDENT",
      targetId: student.id,
      targetName: `طالب: ${student.name} - باقة: ${planType} (${subPrice} EGP)`,
    }).catch(() => {});

    return NextResponse.json({ success: true, subscription: sub });
  } catch (error) {
    console.error("[teacher/subscriptions POST] error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء إضافة الطالب" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (!isTeacherLike(session.role) && session.role !== "admin" && session.role !== "superadmin")) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "معرف الاشتراك (id) مطلوب للحذف" }, { status: 400 });
    }

    const sub = await prisma.teacherSubscription.findUnique({
      where: { id },
      select: { id: true, teacherId: true, studentName: true, planLabel: true, studentId: true },
    });

    if (!sub) {
      return NextResponse.json({ error: "الاشتراك غير موجود" }, { status: 404 });
    }

    // Security check: teacher can only delete subscriptions for their own account unless admin/superadmin
    if (isTeacherLike(session.role) && sub.teacherId !== actingTeacherId(session)) {
      return NextResponse.json({ error: "غير مصرح لك بحذف هذا الاشتراك" }, { status: 403 });
    }

    await prisma.teacherSubscription.delete({
      where: { id },
    });

    const { logAdminAction } = await import("@/lib/admin-auth");
    await logAdminAction({
      adminId: session.id,
      adminName: session.name,
      action: "DELETE_TEACHER_SUBSCRIPTION",
      targetType: "STUDENT",
      targetId: sub.studentId,
      targetName: `حذف اشتراك: ${sub.studentName} (${sub.planLabel})`,
    }).catch(() => {});

    return NextResponse.json({ success: true, message: "تم حذف الاشتراك وإغلاقه بنجاح" });
  } catch (error) {
    console.error("[teacher/subscriptions DELETE] error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء حذف الاشتراك" }, { status: 500 });
  }
}
