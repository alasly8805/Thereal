import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { verifyMasterPassword } from "@/lib/admin-auth";

export type AdminLoginInput = {
  role: string;
  password: string;
  name: string;
  email: string;
  clientIp: string;
};

export type AdminLoginUser = {
  id: string;
  name: string;
  role: string;
  isOwner?: boolean;
  assistantOfTeacherId?: string | null;
};

export type AdminLoginResult =
  | { ok: true; user: AdminLoginUser; token: string }
  | { ok: false; status: number; error: string };

/**
 * Shared admin-panel login. Used by both the JSON API and the form POST
 * handler so we never HTTP-loop back into the same Node process (that hang
 * is what made «دخول» spin forever on a single PM2 worker).
 */
export async function performAdminLogin(input: AdminLoginInput): Promise<AdminLoginResult> {
  const role = input.role;
  const password = input.password;
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const clientIp = input.clientIp || "127.0.0.1";

  if (password && verifyMasterPassword(password)) {
    const token = await signToken({
      id: "superadmin",
      email: "superadmin@system",
      name: "المشرف العام",
      role: "superadmin",
      isOwner: true,
    });
    return {
      ok: true,
      token,
      user: { id: "superadmin", name: "المشرف العام", role: "superadmin", isOwner: true },
    };
  }

  const today = new Date().toISOString().split("T")[0];
  const identifier = (name || email || clientIp).replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 50);
  const failedTriesKeyId = `admin_failed_logins_${today}_${identifier}`;
  const failedTriesKeyIp = `admin_failed_logins_${today}_${clientIp.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;

  const [idSetting, ipSetting] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: failedTriesKeyId } }),
    prisma.appSetting.findUnique({ where: { key: failedTriesKeyIp } }),
  ]);

  const idTries = idSetting ? parseInt(idSetting.value, 10) : 0;
  const ipTries = ipSetting ? parseInt(ipSetting.value, 10) : 0;

  if (idTries >= 15 || ipTries >= 30) {
    return {
      ok: false,
      status: 429,
      error: "تم تجاوز الحد الأقصى لمحاولات الدخول الفاشلة. يرجى المحاولة لاحقاً أو التواصل مع المشرف.",
    };
  }

  const recordFailedAttempt = async () => {
    await Promise.all([
      prisma.appSetting.upsert({
        where: { key: failedTriesKeyId },
        update: { value: String(idTries + 1) },
        create: { key: failedTriesKeyId, value: String(idTries + 1) },
      }),
      prisma.appSetting.upsert({
        where: { key: failedTriesKeyIp },
        update: { value: String(ipTries + 1) },
        create: { key: failedTriesKeyIp, value: String(ipTries + 1) },
      }),
    ]).catch(() => {});
  };

  const resetFailedAttempts = async () => {
    await prisma.appSetting.deleteMany({
      where: { key: { in: [failedTriesKeyId, failedTriesKeyIp] } },
    }).catch(() => {});
  };

  if (role === "superadmin") {
    if (!password) {
      return { ok: false, status: 400, error: "كلمة المرور مطلوبة" };
    }

    const superadmins = await prisma.user.findMany({
      where: { role: "superadmin", isActive: true, isDeleted: false },
    });

    for (const sa of superadmins) {
      if (sa.password && (await bcrypt.compare(password, sa.password))) {
        await resetFailedAttempts();
        const token = await signToken({
          id: sa.id,
          email: sa.email,
          name: sa.name,
          role: "superadmin",
          isOwner: sa.isOwner,
        });
        return {
          ok: true,
          token,
          user: { id: sa.id, name: sa.name, role: "superadmin", isOwner: sa.isOwner },
        };
      }
    }

    await recordFailedAttempt();
    return { ok: false, status: 401, error: "كلمة المرور الرئيسية غير صحيحة" };
  }

  if (role === "teacher") {
    if (!name || !password) {
      return { ok: false, status: 400, error: "الاسم أو البريد الإلكتروني وكلمة المرور مطلوبان" };
    }

    const cleanQuery = name.trim();
    const lowerQuery = cleanQuery.toLowerCase();
    const isDemoAlias = ["demo", "demo_teacher@test.local", "المدرس التجريبي"].includes(lowerQuery);

    let teacher = null;

    if (isDemoAlias) {
      teacher = await prisma.user.findFirst({
        where: {
          role: "teacher",
          isDeleted: false,
          OR: [{ email: "demo_teacher@test.local" }, { isDemo: true }],
        },
      });

      if (!teacher) {
        const passHash = await bcrypt.hash(process.env.DEMO_TEACHER_PASSWORD || "Admin123", 10);
        teacher = await prisma.user.upsert({
          where: { email: "demo_teacher@test.local" },
          update: { name: "المدرس التجريبي", role: "teacher", isDemo: true, isActive: true, isDeleted: false },
          create: {
            name: "المدرس التجريبي",
            email: "demo_teacher@test.local",
            password: passHash,
            role: "teacher",
            isDemo: true,
            isActive: true,
            isDeleted: false,
          },
        });

        await prisma.teacherProfile.upsert({
          where: { teacherId: teacher.id },
          update: { displayName: "المدرس التجريبي (DEMO)", slug: "demo", isPublished: true },
          create: { teacherId: teacher.id, displayName: "المدرس التجريبي (DEMO)", slug: "demo", isPublished: true },
        });
      }
    } else {
      teacher = await prisma.user.findFirst({
        where: {
          role: "teacher",
          isDeleted: false,
          OR: [
            { name: cleanQuery },
            { email: lowerQuery },
            { teacherProfile: { slug: cleanQuery } },
            { teacherProfile: { displayName: cleanQuery } },
          ],
        },
      });

      if (!teacher) {
        teacher = await prisma.user.findFirst({
          where: {
            role: "teacher",
            isDeleted: false,
            OR: [
              { name: { contains: cleanQuery } },
              { teacherProfile: { displayName: { contains: cleanQuery } } },
            ],
          },
        });
      }
    }

    if (!teacher) {
      await recordFailedAttempt();
      return { ok: false, status: 401, error: "بيانات الدخول غير صحيحة" };
    }
    if (!teacher.isActive) {
      return { ok: false, status: 403, error: "هذا الحساب موقوف. تواصل مع المشرف العام" };
    }

    const isBcrypt = teacher.password ? await bcrypt.compare(password, teacher.password).catch(() => false) : false;
    const isDemoPass =
      (teacher.isDemo || teacher.email === "demo_teacher@test.local") &&
      password === (process.env.DEMO_TEACHER_PASSWORD || "Admin123");
    const valid = isBcrypt || isDemoPass;

    if (!valid) {
      await recordFailedAttempt();
      return { ok: false, status: 401, error: "بيانات الدخول غير صحيحة" };
    }

    await resetFailedAttempts();
    const token = await signToken({
      id: teacher.id,
      email: teacher.email,
      name: teacher.name,
      role: "teacher",
      tokenVersion: teacher.tokenVersion,
    });
    return { ok: true, token, user: { id: teacher.id, name: teacher.name, role: "teacher" } };
  }

  if (role === "assistant") {
    if (!name || !password) {
      return { ok: false, status: 400, error: "اسم المساعد وكلمة المرور مطلوبان" };
    }

    const cleanQuery = name.trim();
    const assistant = await prisma.user.findFirst({
      where: {
        role: "assistant",
        isDeleted: false,
        OR: [{ name: cleanQuery }, { email: cleanQuery.toLowerCase() }],
      },
    });

    if (!assistant || !assistant.password) {
      await recordFailedAttempt();
      return { ok: false, status: 401, error: "بيانات الدخول غير صحيحة" };
    }
    if (!assistant.isActive) {
      return { ok: false, status: 403, error: "هذا الحساب موقوف. تواصل مع المدرّس" };
    }
    if (!assistant.assistantOfTeacherId) {
      return { ok: false, status: 403, error: "الحساب غير مرتبط بمدرّس" };
    }

    const valid = await bcrypt.compare(password, assistant.password).catch(() => false);
    if (!valid) {
      await recordFailedAttempt();
      return { ok: false, status: 401, error: "بيانات الدخول غير صحيحة" };
    }

    await resetFailedAttempts();
    await prisma.user
      .update({
        where: { id: assistant.id },
        data: { lastLoginAt: new Date() },
      })
      .catch(() => {});

    const token = await signToken({
      id: assistant.id,
      email: assistant.email,
      name: assistant.name,
      role: "assistant",
      tokenVersion: assistant.tokenVersion,
    });
    return {
      ok: true,
      token,
      user: {
        id: assistant.id,
        name: assistant.name,
        role: "assistant",
        assistantOfTeacherId: assistant.assistantOfTeacherId,
      },
    };
  }

  if (role === "staff_portal") {
    if (!email || !password) {
      return { ok: false, status: 400, error: "البريد الإلكتروني وكلمة المرور مطلوبان" };
    }
    const user = await prisma.user.findFirst({
      where: {
        email,
        role: { in: ["admin", "staff"] },
        isDeleted: false,
      },
    });
    if (!user || !user.password) {
      await recordFailedAttempt();
      return { ok: false, status: 401, error: "بيانات الدخول غير صحيحة" };
    }
    if (!user.isActive) {
      return { ok: false, status: 403, error: "هذا الحساب موقوف. تواصل مع المشرف العام" };
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      await recordFailedAttempt();
      return { ok: false, status: 401, error: "بيانات الدخول غير صحيحة" };
    }

    await resetFailedAttempts();
    const token = await signToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
    return { ok: true, token, user: { id: user.id, name: user.name, role: user.role } };
  }

  return { ok: false, status: 400, error: "دور غير صحيح" };
}

export function adminPanelDestination(role: string) {
  if (role === "assistant") return "/adminpanel/assistant";
  if (role === "teacher") return "/adminpanel/teacher";
  return "/adminpanel/superadmin";
}

export function publicAppOrigin(reqUrl: string) {
  const env = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (env) return env;
  try {
    return new URL(reqUrl).origin;
  } catch {
    return "https://code-up.tech";
  }
}
