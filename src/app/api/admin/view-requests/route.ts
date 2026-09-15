import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId, hasAssistantPermission, maskPhone } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/admin-auth";
import { notifyViewRequestResolved } from "@/lib/notifications";

/** Upper bound on a single grant, so a slip of the keyboard can't unlock a video forever. */
const MAX_GRANT = 20;
const MAX_NOTES_LENGTH = 500;

/**
 * A teacher may only ever see or act on requests for videos inside their own
 * courses. Admins and superadmins see everything.
 */
function ownershipFilter(session: { id: string; role: string }) {
  if (session.role === "admin" || session.role === "superadmin") return {};
  return { video: { folder: { course: { teacherId: actingTeacherId(session) } } } };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || (!isTeacherLike(session.role) && session.role !== "admin" && session.role !== "superadmin")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  if (isTeacherLike(session.role) && !hasAssistantPermission(session, "manageRequests")) {
    return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية الطلبات" }, { status: 403 });
  }

  const statusParam = req.nextUrl.searchParams.get("status") || "pending";
  const allowed = ["pending", "approved", "rejected", "all"];
  const status = allowed.includes(statusParam) ? statusParam : "pending";

  const requests = await prisma.videoViewRequest.findMany({
    where: {
      ...ownershipFilter(session),
      ...(status === "all" ? {} : { status }),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      status: true,
      reason: true,
      grantedViews: true,
      teacherNotes: true,
      reviewedAt: true,
      createdAt: true,
      student: { select: { id: true, name: true, phone: true } },
      video: {
        select: {
          id: true,
          title: true,
          maxWatchesPerUser: true,
          folder: { select: { name: true, course: { select: { id: true, title: true } } } },
        },
      },
    },
  });

  const pendingCount = await prisma.videoViewRequest.count({
    where: { ...ownershipFilter(session), status: "pending" },
  });

  const canSeePhones = hasAssistantPermission(session, "viewStudentPhones");
  return NextResponse.json({
    requests: requests.map((r) => ({
      ...r,
      student: r.student
        ? { ...r.student, phone: canSeePhones ? r.student.phone : maskPhone(r.student.phone) }
        : r.student,
    })),
    pendingCount,
  });
}

/** Approve (granting N extra views) or reject a pending request. */
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || (!isTeacherLike(session.role) && session.role !== "admin" && session.role !== "superadmin")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  if (isTeacherLike(session.role) && !hasAssistantPermission(session, "manageRequests")) {
    return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية الطلبات" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    requestId?: string;
    action?: string;
    grantedViews?: number;
    teacherNotes?: string;
  };

  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  const action = body.action === "approve" ? "approve" : body.action === "reject" ? "reject" : null;
  if (!requestId || !action) {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const notes =
    typeof body.teacherNotes === "string" ? body.teacherNotes.trim().slice(0, MAX_NOTES_LENGTH) : "";

  let grantedViews = 0;
  if (action === "approve") {
    const raw = Number(body.grantedViews);
    // Reject rather than silently clamp: a teacher who typed 500 should see why
    // it did not happen instead of quietly granting 20.
    if (!Number.isInteger(raw) || raw < 1 || raw > MAX_GRANT) {
      return NextResponse.json(
        { error: `عدد المشاهدات الإضافية يجب أن يكون رقمًا بين 1 و ${MAX_GRANT}` },
        { status: 400 }
      );
    }
    grantedViews = raw;
  }

  // Get request details first so we can verify ownership and send student notification
  const targetReq = await prisma.videoViewRequest.findFirst({
    where: {
      id: requestId,
      status: "pending",
      ...ownershipFilter(session),
    },
    select: {
      id: true,
      studentId: true,
      video: {
        select: {
          id: true,
          title: true,
          folder: { select: { courseId: true } },
        },
      },
    },
  });

  if (!targetReq) {
    return NextResponse.json(
      { error: "الطلب غير موجود أو تمت مراجعته بالفعل" },
      { status: 404 }
    );
  }

  // Scope the update by ownership AND by status so a teacher cannot act on
  // another teacher's request, and so two reviewers cannot both resolve the
  // same pending row.
  const result = await prisma.videoViewRequest.updateMany({
    where: {
      id: requestId,
      status: "pending",
      ...ownershipFilter(session),
    },
    data: {
      status: action === "approve" ? "approved" : "rejected",
      grantedViews,
      teacherId: actingTeacherId(session),
      teacherNotes: notes || null,
      reviewedAt: new Date(),
    },
  });

  if (result.count === 0) {
    return NextResponse.json(
      { error: "الطلب غير موجود أو تمت مراجعته بالفعل" },
      { status: 404 }
    );
  }

  // Fire-and-forget notification to student
  notifyViewRequestResolved(
    targetReq.studentId,
    action === "approve",
    targetReq.video.title,
    grantedViews,
    targetReq.video.folder.courseId,
    targetReq.video.id
  ).catch(() => {});

  await logAdminAction({
    adminId: session.id,
    adminName: session.name,
    action: action === "approve" ? "VIEW_REQUEST_APPROVED" : "VIEW_REQUEST_REJECTED",
    targetType: "VIDEO_VIEW_REQUEST",
    targetId: requestId,
    targetName: `${grantedViews} extra views`,
  }).catch(() => {});

  return NextResponse.json({ ok: true, grantedViews });
}
