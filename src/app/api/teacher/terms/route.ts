import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { BOOKING_KINDS, TERM_NUMBERS, bookingCoversCourse, loadTeacherTerms } from "@/lib/teacher-terms";

export const dynamic = "force-dynamic";

async function resolveTeacherId(req: NextRequest): Promise<{ error?: string; teacherId?: string }> {
  const session = await getSession();
  if (!session) {
    return { error: "يرجى تسجيل الدخول أولًا" };
  }

  if (session.role === "teacher") {
    return { teacherId: session.id };
  }

  if (session.role === "assistant") {
    const parentId = (session as unknown as { assistantOfTeacherId?: string }).assistantOfTeacherId || session.id;
    return { teacherId: parentId };
  }

  if (session.role === "superadmin") {
    const urlTeacherId = new URL(req.url).searchParams.get("teacherId");
    if (urlTeacherId) return { teacherId: urlTeacherId };
    return { teacherId: session.id };
  }

  return { error: "غير مصرح لك بالوصول" };
}

function activeBookingsWhere(teacherId: string) {
  return {
    teacherId,
    status: "active",
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    student: { accountMode: { not: "TESTER" } },
  };
}

function termBookingWhere(teacherId: string, stage: string, term: number) {
  return {
    ...activeBookingsWhere(teacherId),
    planType: "termly",
    educationalStage: stage,
    AND: [
      {
        OR: [
          { termNumbers: { equals: [term] } },
          ...(term === 1 ? [{ termNumbers: { isEmpty: true } }] : []),
        ],
      },
    ],
  };
}

async function getTeacherState(teacherId: string) {
  const [courses, terms, bookings] = await Promise.all([
    prisma.course.findMany({
      where: { teacherId, isVirtual: false },
      select: {
        id: true,
        title: true,
        educationalStage: true,
        price: true,
        isPaid: true,
        bookingKind: true,
        bookingTerm: true,
      },
      orderBy: [{ educationalStage: "asc" }, { createdAt: "asc" }],
    }),
    prisma.teacherTerm.findMany({
      where: { teacherId },
      select: { educationalStage: true, termNumber: true, endsAt: true, onSale: true },
    }),
    prisma.teacherSubscription.findMany({
      where: { teacherId, student: { accountMode: { not: "TESTER" } } },
      select: {
        id: true,
        studentId: true,
        studentName: true,
        studentPhone: true,
        planType: true,
        educationalStage: true,
        languageTrack: true,
        termNumbers: true,
        amount: true,
        paymentSource: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return { courses, terms, bookings };
}

function parseDate(v: unknown): Date | null {
  if (!v || typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function determineCourseTerm(bookingKind: string | null | undefined, explicitTerm: unknown): number | null {
  const num = Number(explicitTerm);
  if (num === 1 || num === 2) return num;
  if (!bookingKind) return null;
  const monthMatch = bookingKind.match(/month:(\d+)/);
  if (monthMatch) {
    const m = Number(monthMatch[1]);
    return m >= 5 ? 2 : 1;
  }
  const termMatch = bookingKind.match(/term:([12])/);
  if (termMatch) return Number(termMatch[1]);
  if (bookingKind === "month") return 1;
  if (bookingKind === "term") return num === 2 ? 2 : 1;
  return null;
}

export async function GET(req: NextRequest) {
  const auth = await resolveTeacherId(req);
  if (auth.error || !auth.teacherId) {
    return NextResponse.json({ error: auth.error || "غير مصرح" }, { status: 403 });
  }

  const data = await getTeacherState(auth.teacherId);
  return NextResponse.json(data);
}

type CourseChange = { id: string; bookingKind: string | null; bookingTerm: number | null };
type TermChange = { educationalStage: string; termNumber: number; endsAt: string | null; onSale: boolean };

export async function PUT(req: NextRequest) {
  const auth = await resolveTeacherId(req);
  if (auth.error || !auth.teacherId) {
    return NextResponse.json({ error: auth.error || "غير مصرح" }, { status: 403 });
  }
  const teacherId = auth.teacherId;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });

  const courseChanges: CourseChange[] = Array.isArray(body.courses) ? body.courses : [];
  const termChanges: TermChange[] = Array.isArray(body.terms) ? body.terms : [];

  for (const c of courseChanges) {
    if (typeof c?.id !== "string") return NextResponse.json({ error: "كورس غير صالح" }, { status: 400 });
    if (c.bookingKind !== null && c.bookingKind !== "") {
      const tokens = String(c.bookingKind).split(",").map((s) => s.trim()).filter(Boolean);
      const allValid = tokens.every((token) => {
        if (token === "extra" || token === "none" || token === "month" || token === "term") return true;
        if (token.startsWith("month:") || token.startsWith("term:")) {
          const t = Number(token.split(":")[1]);
          return t === 1 || t === 2;
        }
        return false;
      });
      if (!allValid) {
        return NextResponse.json({ error: "نوع حجز غير صالح" }, { status: 400 });
      }
    }
  }

  for (const t of termChanges) {
    if (typeof t?.educationalStage !== "string" || !(TERM_NUMBERS as readonly number[]).includes(Number(t.termNumber))) {
      return NextResponse.json({ error: "بيانات الترم غير صالحة" }, { status: 400 });
    }
  }

  const owned = await prisma.course.findMany({
    where: { teacherId, id: { in: courseChanges.map((c) => c.id) } },
    select: { id: true, title: true, educationalStage: true, bookingKind: true, bookingTerm: true },
  });
  if (owned.length !== new Set(courseChanges.map((c) => c.id)).size) {
    return NextResponse.json({ error: "بعض الكورسات لا تخص هذا المعلم" }, { status: 400 });
  }

  const subs = await prisma.teacherSubscription.findMany({
    where: activeBookingsWhere(teacherId),
    select: { teacherId: true, planType: true, educationalStage: true, termNumbers: true },
  });
  const terms = await loadTeacherTerms([teacherId]);
  const losses: { courseId: string; title: string; students: number }[] = [];
  for (const course of owned) {
    const change = courseChanges.find((c) => c.id === course.id)!;
    const determinedTerm = determineCourseTerm(change.bookingKind, change.bookingTerm);
    const next = {
      ...course,
      bookingKind: change.bookingKind || null,
      bookingTerm: determinedTerm,
    };
    if (next.bookingKind === course.bookingKind && next.bookingTerm === course.bookingTerm) continue;
    const lost = subs.filter((s) => bookingCoversCourse(s, course, terms) && !bookingCoversCourse(s, next, terms)).length;
    if (lost > 0) losses.push({ courseId: course.id, title: course.title, students: lost });
  }

  if (body.preview) return NextResponse.json({ losses });

  await prisma.$transaction([
    ...courseChanges.map((c) =>
      prisma.course.update({
        where: { id: c.id },
        data: {
          bookingKind: c.bookingKind || null,
          bookingTerm: determineCourseTerm(c.bookingKind, c.bookingTerm),
        },
      })
    ),
    ...termChanges.map((t) =>
      prisma.teacherTerm.upsert({
        where: {
          teacherId_educationalStage_termNumber: {
            teacherId,
            educationalStage: t.educationalStage,
            termNumber: Number(t.termNumber),
          },
        },
        create: {
          teacherId,
          educationalStage: t.educationalStage,
          termNumber: Number(t.termNumber),
          endsAt: parseDate(t.endsAt),
          onSale: Boolean(t.onSale),
        },
        update: { endsAt: parseDate(t.endsAt), onSale: Boolean(t.onSale) },
      })
    ),
  ]);

  return NextResponse.json({ ok: true, losses, ...(await getTeacherState(teacherId)) });
}

export async function POST(req: NextRequest) {
  const auth = await resolveTeacherId(req);
  if (auth.error || !auth.teacherId) {
    return NextResponse.json({ error: auth.error || "غير مصرح" }, { status: 403 });
  }
  const teacherId = auth.teacherId;

  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });

  if (body.action === "applyEndDate") {
    const stage = String(body.educationalStage || "");
    const term = Number(body.termNumber);
    const row = await prisma.teacherTerm.findUnique({
      where: { teacherId_educationalStage_termNumber: { teacherId, educationalStage: stage, termNumber: term } },
      select: { endsAt: true },
    });
    if (!row?.endsAt) return NextResponse.json({ error: "احفظ تاريخ نهاية الترم أولاً" }, { status: 400 });

    const where = termBookingWhere(teacherId, stage, term);
    const [total, shortened] = await Promise.all([
      prisma.teacherSubscription.count({ where }),
      prisma.teacherSubscription.count({ where: { ...where, expiresAt: { gt: row.endsAt } } }),
    ]);
    if (body.preview) return NextResponse.json({ total, shortened, endsAt: row.endsAt });

    const res = await prisma.teacherSubscription.updateMany({ where, data: { expiresAt: row.endsAt } });
    return NextResponse.json({ ok: true, updated: res.count, ...(await getTeacherState(teacherId)) });
  }

  if (body.action === "updateBooking") {
    const booking = await prisma.teacherSubscription.findFirst({
      where: { id: String(body.bookingId || ""), teacherId },
      select: { id: true },
    });
    if (!booking) return NextResponse.json({ error: "الحجز غير موجود" }, { status: 404 });

    const data: { termNumbers?: number[]; expiresAt?: Date | null; status?: string } = {};
    if (Array.isArray(body.termNumbers)) {
      const nums = [...new Set<number>((body.termNumbers as unknown[]).map(Number))]
        .filter((n) => (TERM_NUMBERS as readonly number[]).includes(n))
        .sort();
      data.termNumbers = nums;
    }
    if ("expiresAt" in body) data.expiresAt = parseDate(body.expiresAt);
    if (body.status === "active" || body.status === "cancelled") data.status = body.status;

    await prisma.teacherSubscription.update({ where: { id: booking.id }, data });
    return NextResponse.json({ ok: true, ...(await getTeacherState(teacherId)) });
  }

  return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
}
