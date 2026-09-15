import { NextResponse } from "next/server";
import type { SessionUser } from "@/lib/auth";
import {
  actingTeacherId,
  ALL_ASSISTANT_PERMISSIONS,
  DEFAULT_ASSISTANT_PERMISSIONS,
  isTeacherLike,
  type AssistantPermission,
  type AssistantPermissions,
} from "@/lib/teacher-scope";

export type TeacherContext = {
  session: SessionUser;
  teacherId: string;
  isAssistant: boolean;
  permissions: AssistantPermissions;
};

export async function requireTeacherContext(
  permission?: AssistantPermission
): Promise<{ ok: true; ctx: TeacherContext } | { ok: false; response: NextResponse }> {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session || !isTeacherLike(session.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "غير مصرح" }, { status: 403 }),
    };
  }

  if (session.role === "assistant" && !session.assistantOfTeacherId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "حساب المساعد غير مرتبط بمدرّس" }, { status: 403 }),
    };
  }

  const permissions =
    session.role === "teacher"
      ? ALL_ASSISTANT_PERMISSIONS
      : session.assistantPermissions || DEFAULT_ASSISTANT_PERMISSIONS;

  if (permission && session.role === "assistant" && !permissions[permission]) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "المدرّس لم يمنحك هذه الصلاحية" },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    ctx: {
      session,
      teacherId: actingTeacherId(session),
      isAssistant: session.role === "assistant",
      permissions,
    },
  };
}
