import { logAdminAction } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import { slugify, isValidSlug } from "@/lib/slug";

async function uniqueSlug(name: string, teacherId: string): Promise<string> {
  let base = slugify(name);
  if (!isValidSlug(base)) base = "teacher";
  let candidate = base;
  let n = 2;
  // Find a free slug (ignore the teacher's own row).
  while (true) {
    const taken = await prisma.teacherProfile.findFirst({
      where: { slug: candidate, NOT: { teacherId } },
      select: { id: true },
    });
    if (!taken) return candidate;
    candidate = `${base}-${n++}`;
  }
}

const EDITABLE = ["displayName", "bio", "photoUrl", "bannerUrl", "navColor", "accentColor", "socials", "featuredCourseId", "priceMonthly", "priceTermly", "priceYearly", "courseStartDate", "bookingContactUrl", "priceLanguagesMonthly", "priceLanguagesTermly", "priceLanguagesYearly", "paymentNotes", "enableLanguagesTrack", "stagePricing"] as const;

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "teacher") {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    let profile = await prisma.teacherProfile.findUnique({ where: { teacherId: actingTeacherId(session) } });
    if (!profile) {
      profile = await prisma.teacherProfile.create({
        data: {
          teacherId: actingTeacherId(session),
          slug: await uniqueSlug(session.name, session.id),
          displayName: session.name,
          priceMonthly: 180,
          priceTermly: 750,
          priceYearly: 1200,
          enableLanguagesTrack: true,
          priceLanguagesMonthly: 0,
          priceLanguagesTermly: 0,
          priceLanguagesYearly: 0,
        },
      });
    } else {
      // Ensure defaults only for newly initialized profiles without any pricing configuration
      const updates: Record<string, any> = {};
      if (profile.priceMonthly == null && !profile.stagePricing) updates.priceMonthly = 180;
      if (profile.priceTermly == null && !profile.stagePricing) updates.priceTermly = 750;
      if (profile.priceYearly == null && !profile.stagePricing) updates.priceYearly = 1200;
      if (profile.enableLanguagesTrack == null) updates.enableLanguagesTrack = true;
      if (profile.priceLanguagesMonthly == null) updates.priceLanguagesMonthly = 0;
      if (profile.priceLanguagesTermly == null) updates.priceLanguagesTermly = 0;
      if (profile.priceLanguagesYearly == null) updates.priceLanguagesYearly = 0;

      if (Object.keys(updates).length > 0) {
        profile = await prisma.teacherProfile.update({
          where: { teacherId: actingTeacherId(session) },
          data: updates,
        });
      }
    }
    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json({ error: "حدث خطأ داخلي" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();

    if (session && session.role === "superadmin") {
      try {
        await logAdminAction({
          adminId: session.id,
          adminName: session.name,
          action: "SUPERADMIN_ACTION",
          targetType: "API_ROUTE",
          targetId: req.nextUrl ? req.nextUrl.pathname : req.url,
          targetName: req.method,
        });
      } catch (e) {}
    }
    if (!session || session.role !== "teacher") {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const data: Record<string, unknown> = {};

    for (const k of EDITABLE) {
      if (k in body) data[k] = body[k];
    }
    if (typeof body.isPublished === "boolean") data.isPublished = body.isPublished;

    // Synchronize root price columns from stagePricing if not explicitly provided
    if (typeof body.stagePricing === "string" && body.stagePricing.trim()) {
      try {
        const parsedMap = JSON.parse(body.stagePricing);
        const firstStage = parsedMap["sec_1"] || parsedMap["sec_2"] || Object.values(parsedMap)[0];
        if (firstStage && typeof firstStage === "object") {
          if (typeof firstStage.priceMonthly === "number" && !("priceMonthly" in body)) {
            data.priceMonthly = firstStage.priceMonthly;
          }
          if (typeof firstStage.priceTermly === "number" && !("priceTermly" in body)) {
            data.priceTermly = firstStage.priceTermly;
          }
          if (typeof firstStage.priceYearly === "number" && !("priceYearly" in body)) {
            data.priceYearly = firstStage.priceYearly;
          }
        }
      } catch {}
    }

    if (typeof body.slug === "string" && body.slug.trim()) {
      const s = slugify(body.slug);
      if (!isValidSlug(s)) {
        return NextResponse.json({ error: "الرابط غير صالح أو محجوز" }, { status: 400 });
      }
      const taken = await prisma.teacherProfile.findFirst({
        where: { slug: s, NOT: { teacherId: actingTeacherId(session) } },
        select: { id: true },
      });
      if (taken) return NextResponse.json({ error: "الرابط مستخدم بالفعل" }, { status: 409 });
      data.slug = s;
    }

    // Ensure a row exists (create-on-write).
    const existing = await prisma.teacherProfile.findUnique({ where: { teacherId: actingTeacherId(session) } });
    const profile = existing
      ? await prisma.teacherProfile.update({ where: { teacherId: actingTeacherId(session) }, data })
      : await prisma.teacherProfile.create({
          data: { teacherId: actingTeacherId(session), slug: (data.slug as string) || (await uniqueSlug(session.name, session.id)), ...data },
        });

    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json({ error: "حدث خطأ داخلي" }, { status: 500 });
  }
}
