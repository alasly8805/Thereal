import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/admin-auth";
import { isCenterItemKind, type CenterItemKind } from "@/lib/center-pass";

type IncomingItem = {
  kind?: string;
  sourceId?: string;
  courseId?: string;
  folderId?: string | null;
  title?: string;
  sortOrder?: number;
};

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { items?: IncomingItem[] };
    const incoming = Array.isArray(body.items) ? body.items : null;
    if (!incoming) {
      return NextResponse.json({ error: "قائمة المحتوى مطلوبة" }, { status: 400 });
    }

    const pass = await prisma.centerPass.findUnique({ where: { id }, select: { id: true, publicId: true } });
    if (!pass) {
      return NextResponse.json({ error: "الرقم التعريفي غير موجود" }, { status: 404 });
    }

    if (session.demoTour) {
      return NextResponse.json({ ok: true, success: true, itemCount: incoming.length });
    }

    const cleaned: {
      kind: CenterItemKind;
      sourceId: string;
      courseId: string;
      folderId: string | null;
      title: string;
      sortOrder: number;
    }[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < incoming.length; i++) {
      const row = incoming[i];
      const kind = String(row.kind || "").toUpperCase();
      const sourceId = String(row.sourceId || "").trim();
      const courseId = String(row.courseId || "").trim();
      if (!isCenterItemKind(kind) || !sourceId || !courseId) continue;
      const key = `${kind}:${sourceId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cleaned.push({
        kind,
        sourceId,
        courseId,
        folderId: row.folderId ? String(row.folderId) : null,
        title: String(row.title || "").trim().slice(0, 200),
        sortOrder: Number.isFinite(row.sortOrder) ? Number(row.sortOrder) : i,
      });
    }

    const videoIds = cleaned.filter((row) => row.kind === "VIDEO").map((row) => row.sourceId);
    const homeworkIds = cleaned.filter((row) => row.kind === "HOMEWORK").map((row) => row.sourceId);
    const quizIds = cleaned.filter((row) => row.kind === "QUIZ").map((row) => row.sourceId);
    const materialIds = cleaned.filter((row) => row.kind === "MATERIAL").map((row) => row.sourceId);

    const [videos, homeworks, quizzes, materials] = await Promise.all([
      videoIds.length ? prisma.video.findMany({ where: { id: { in: videoIds } }, select: { id: true } }) : [],
      homeworkIds.length ? prisma.homework.findMany({ where: { id: { in: homeworkIds } }, select: { id: true } }) : [],
      quizIds.length ? prisma.quiz.findMany({ where: { id: { in: quizIds } }, select: { id: true } }) : [],
      materialIds.length ? prisma.material.findMany({ where: { id: { in: materialIds } }, select: { id: true } }) : [],
    ]);

    const existing = new Set([
      ...videos.map((row) => `VIDEO:${row.id}`),
      ...homeworks.map((row) => `HOMEWORK:${row.id}`),
      ...quizzes.map((row) => `QUIZ:${row.id}`),
      ...materials.map((row) => `MATERIAL:${row.id}`),
    ]);

    const valid = cleaned.filter((row) => existing.has(`${row.kind}:${row.sourceId}`));

    await prisma.$transaction([
      prisma.centerPassItem.deleteMany({ where: { passId: id } }),
      ...(valid.length
        ? [
            prisma.centerPassItem.createMany({
              data: valid.map((row) => ({
                passId: id,
                kind: row.kind,
                sourceId: row.sourceId,
                courseId: row.courseId,
                folderId: row.folderId,
                title: row.title,
                sortOrder: row.sortOrder,
              })),
            }),
          ]
        : []),
    ]);

    await logAdminAction({
      adminId: session.id,
      adminName: session.name,
      action: "UPDATE_CENTER_PASS_BUNDLE",
      targetType: "CenterPass",
      targetId: pass.id,
      targetName: pass.publicId,
      metadata: { itemCount: valid.length },
    });

    return NextResponse.json({ success: true, itemCount: valid.length });
  } catch (err) {
    console.error("PUT center-passes/[id]/bundle error:", err);
    return NextResponse.json({ error: "تعذر حفظ المحتوى المخصص" }, { status: 500 });
  }
}
