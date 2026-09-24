import { randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isCenterRequest } from "@/lib/center-mode";

export type CenterItemKind = "VIDEO" | "HOMEWORK" | "QUIZ" | "MATERIAL";

export const CENTER_ITEM_KINDS: CenterItemKind[] = ["VIDEO", "HOMEWORK", "QUIZ", "MATERIAL"];

const PUBLIC_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type CenterPassGrant = {
  passId: string;
  publicId: string;
  title: string;
  studentId: string;
  isActive: boolean;
  courseIds: Set<string>;
  keys: Set<string>;
  has: (kind: CenterItemKind, sourceId: string) => boolean;
};

export function itemKey(kind: CenterItemKind, sourceId: string) {
  return `${kind}:${sourceId}`;
}

export function isCenterItemKind(value: string): value is CenterItemKind {
  return CENTER_ITEM_KINDS.includes(value as CenterItemKind);
}

export function generatePublicId() {
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += PUBLIC_ID_ALPHABET[randomInt(PUBLIC_ID_ALPHABET.length)];
  }
  return `CTR-${suffix}`;
}

export function generateCenterPassword(length = 10) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[randomInt(alphabet.length)];
  }
  return out;
}

export function normalizePublicId(raw: string) {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

const PUBLIC_ID_RE = new RegExp(`^[${PUBLIC_ID_ALPHABET}]+$`);

/** Superadmin-chosen Center ID, stored as CTR-XXXXXX (same shape as CTR-ZMK5HY). */
export function parseCustomPublicId(raw: string): { ok: true; publicId: string } | { ok: false; error: string } {
  let suffix = normalizePublicId(raw);
  if (suffix.startsWith("CTR-")) suffix = suffix.slice(4);
  else if (suffix.startsWith("CTR")) suffix = suffix.slice(3);

  if (!suffix) return { ok: false, error: "الرقم التعريفي مطلوب — مثال: CTR-ZMK5HY" };
  if (suffix.length !== 6) {
    return { ok: false, error: "الشكل المطلوب CTR- ثم 6 خانات — مثال: CTR-ZMK5HY" };
  }
  if (!PUBLIC_ID_RE.test(suffix)) {
    return {
      ok: false,
      error: "نفس حروف CTR-ZMK5HY فقط (بدون I و O و 0 و 1 عشان ما تتلخبطش مع الطباعة)",
    };
  }
  return { ok: true, publicId: `CTR-${suffix}` };
}

export async function assertPublicIdAvailable(publicId: string) {
  const [pass, emailUser] = await Promise.all([
    prisma.centerPass.findUnique({ where: { publicId }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: centerPassEmail(publicId) }, select: { id: true } }),
  ]);
  if (pass || emailUser) {
    return { ok: false as const, error: "هذا الكود مستخدم بالفعل — اختر كوداً آخر" };
  }
  return { ok: true as const };
}

export function centerPassEmail(publicId: string) {
  return `center_${publicId.replace(/[^A-Za-z0-9]/g, "").toLowerCase()}@center.internal`;
}

export async function mintUniquePublicId() {
  for (let i = 0; i < 12; i++) {
    const publicId = generatePublicId();
    const exists = await prisma.centerPass.findUnique({
      where: { publicId },
      select: { id: true },
    });
    if (!exists) return publicId;
  }
  throw new Error("CENTER_PASS_ID_COLLISION");
}

export async function getCenterPassGrant(studentId: string): Promise<CenterPassGrant | null> {
  const pass = await prisma.centerPass.findUnique({
    where: { studentId },
    select: {
      id: true,
      publicId: true,
      title: true,
      studentId: true,
      isActive: true,
      items: { select: { kind: true, sourceId: true, courseId: true } },
    },
  });
  if (!pass) return null;

  const keys = new Set(pass.items.map((item) => `${item.kind}:${item.sourceId}`));
  const courseIds = pass.isActive
    ? new Set(pass.items.map((item) => item.courseId))
    : new Set<string>();

  return {
    passId: pass.id,
    publicId: pass.publicId,
    title: pass.title,
    studentId: pass.studentId,
    isActive: pass.isActive,
    courseIds,
    keys,
    has(kind, sourceId) {
      return pass.isActive && keys.has(`${kind}:${sourceId}`);
    },
  };
}

export function filterFoldersForGrant<
  T extends {
    videos?: { id: string }[];
    quizzes?: { id: string }[];
    homeworks?: { id: string }[];
    materials?: { id: string }[];
  },
>(folders: T[], grant: CenterPassGrant): T[] {
  return folders
    .map((folder) => {
      const videos = (folder.videos || []).filter((row) => grant.has("VIDEO", row.id));
      const quizzes = (folder.quizzes || []).filter((row) => grant.has("QUIZ", row.id));
      const homeworks = (folder.homeworks || []).filter((row) => grant.has("HOMEWORK", row.id));
      const materials = (folder.materials || []).filter((row) => grant.has("MATERIAL", row.id));
      if (!videos.length && !quizzes.length && !homeworks.length && !materials.length) {
        return null;
      }
      return { ...folder, videos, quizzes, homeworks, materials };
    })
    .filter(Boolean) as T[];
}

/** CENTER_ID sessions are hall-only. Returns a 403 response when the host is the online site. */
export function denyCenterIdOffHost(req: NextRequest, accountMode?: string | null) {
  if (accountMode !== "CENTER_ID") return null;
  if (isCenterRequest(req)) return null;
  return NextResponse.json(
    {
      error: "حساب الرقم التعريفي يعمل فقط على منصة السنتر (center.code-up.tech).",
      code: "CENTER_ID_HOST_ONLY",
    },
    { status: 403 }
  );
}

export function centerHostLoginDenied(req: NextRequest) {
  if (isCenterRequest(req)) return null;
  return NextResponse.json(
    {
      error: "الدخول بالرقم التعريفي متاح فقط من center.code-up.tech",
      code: "CENTER_HOST_ONLY",
    },
    { status: 403 }
  );
}
