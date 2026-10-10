import { NextResponse } from "next/server";
import { getStudentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { blockSupportView } from "@/lib/support-auth";
import { burstLimited, readJson, tooMany } from "@/lib/essay-ai-http";
import { cairoDay, parseLanguage } from "@/lib/practice";

/** Saves the student's practice track: { track: "ar" | "en" } (عربي / لغات). */
export async function POST(req: Request) {
  try {
    const session = await getStudentSession();
    if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    const blocked = blockSupportView(session);
    if (blocked) return blocked;
    if (burstLimited(`practice-track:${session.id}`, 10, 60_000)) return tooMany();

    const body = await readJson(req);
    const track = parseLanguage(body?.track);
    if (!track) return NextResponse.json({ error: "اختيار غير صالح" }, { status: 400 });

    // One practice a day: after submitting today's set on one track, the other track opens tomorrow.
    const doneToday = await prisma.practiceAttempt.findFirst({
      where: { studentId: session.id, submittedAt: { not: null }, set: { day: cairoDay() } },
      select: { set: { select: { language: true } } },
    });
    if (doneToday && doneToday.set.language !== track) {
      const name = doneToday.set.language === "en" ? "لغات" : "عربي";
      return NextResponse.json({ error: `حلّيت تدريب النهارده بمسار ${name} — تقدر تغيّر المسار من بكرة` }, { status: 409 });
    }

    await prisma.user.update({ where: { id: session.id }, data: { practiceTrack: track } });
    return NextResponse.json({ ok: true, track });
  } catch (error) {
    console.error("[practice] track error:", error);
    return NextResponse.json({ error: "حدث خطأ داخلي" }, { status: 500 });
  }
}
