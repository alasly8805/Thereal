import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { publicAppOrigin } from "@/lib/admin-login";
import {
  impersonateTeacher,
  isTeacherImpersonatePasswordValid,
  teacherImpersonateRedirect,
} from "@/lib/teacher-impersonate";

function failRedirect(reqUrl: string, error: string) {
  const url = new URL("/adminpanel/superadmin", publicAppOrigin(reqUrl));
  url.searchParams.set("section", "teachers");
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, 303);
}

/** Native form POST so Cloudflare does not challenge an /api XHR. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "superadmin") {
    return failRedirect(req.url, "سجّل دخول المشرف العام أولاً");
  }

  const form = await req.formData();
  const teacherId = String(form.get("teacherId") || "").trim();
  const actionPassword = String(form.get("actionPassword") || "");

  if (!teacherId) {
    return failRedirect(req.url, "معرف المعلم مطلوب");
  }

  if (!isTeacherImpersonatePasswordValid(session, actionPassword)) {
    return failRedirect(req.url, "أدخل كلمة مرور إجراءات المشرف أولاً");
  }

  try {
    const result = await impersonateTeacher(session, teacherId);
    if (!result.ok) {
      return failRedirect(req.url, result.error);
    }
    return teacherImpersonateRedirect(req.url, result.token);
  } catch (err) {
    console.error("enter-teacher error:", err);
    return failRedirect(req.url, "تعذر الدخول إلى لوحة المعلم");
  }
}
