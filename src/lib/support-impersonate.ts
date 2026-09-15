/**
 * "Enter a student's account" for the support panel.
 *
 * Mirrors lib/teacher-impersonate.ts, with one deliberate difference: the token
 * minted here carries `supportView: true`, which makes the session READ-ONLY.
 *
 * That flag is what makes the visit anonymous in the sense that matters. Without
 * it, opening a lesson to reproduce a student's complaint would spend one of
 * their paid watch slots, mark the video watched, and pollute the teacher's
 * completion stats — support would be charging the student for its own
 * debugging. With it:
 *   - proxy.ts refuses every non-GET request on the session
 *   - the watch route hands back playback without consuming a slot
 *   - no notification is sent, and nothing on the student's screen changes
 *
 * The visit is still recorded in ActivityLog. Anonymous to the student is not
 * the same as untraceable internally, and a panel that can also change
 * passwords must leave a trail.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyAuthCookie, signToken } from "@/lib/auth";
import { publicAppOrigin } from "@/lib/admin-login";
import { logSupportAction } from "@/lib/support-auth";

/** Support sessions are short — long enough to reproduce a bug, not to linger. */
const SUPPORT_VIEW_MINUTES = 60;

export async function impersonateStudentForSupport(agent: string, studentId: string) {
  const student = await prisma.user.findFirst({
    where: { id: studentId, role: "student", isDeleted: false },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      isActive: true,
      accountMode: true,
      tokenVersion: true,
    },
  });

  if (!student) {
    return { ok: false as const, status: 404, error: "حساب الطالب غير موجود أو تم حذفه" };
  }

  // A suspended account is exactly the kind of thing support is asked about, so
  // this is viewable — the read-only flag means nothing can be changed anyway.
  const token = await signToken({
    id: student.id,
    email: student.email,
    name: student.name,
    role: "student",
    accountMode: student.accountMode || "NORMAL",
    isOwner: false,
    tokenVersion: student.tokenVersion,
    supportView: true,
    supportViewBy: agent,
  });

  await logSupportAction({
    action: "SUPPORT_ENTER_STUDENT_ACCOUNT",
    targetType: "student",
    targetId: student.id,
    targetName: `${student.name} (${student.phone || student.email})`,
    metadata: {
      agent,
      readOnly: true,
      studentSuspended: !student.isActive,
      expiresInMinutes: SUPPORT_VIEW_MINUTES,
    },
  });

  return {
    ok: true as const,
    token,
    student: { id: student.id, name: student.name, phone: student.phone },
  };
}

/**
 * Drops the agent onto the student's home, keeping the support cookie. "/" is
 * where the app itself sends a student after login — there is no /dashboard
 * route despite the name appearing in the proxy's protected list.
 */
export async function supportImpersonateRedirect(reqUrl: string, token: string, to = "/") {
  const origin = publicAppOrigin(reqUrl);
  const redirect = NextResponse.redirect(new URL(to, origin), 303);
  await applyAuthCookie(redirect, token);
  return redirect;
}
