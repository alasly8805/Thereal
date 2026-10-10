import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  console.log("=== BACKFILLING EXPLICIT COURSE ENROLLMENTS FOR SUBSCRIBERS ===");

  const teachers = await prisma.user.findMany({
    where: { role: "teacher" },
    select: { id: true, name: true },
  });

  for (const t of teachers) {
    const subs = await prisma.teacherSubscription.findMany({
      where: { teacherId: t.id, status: "active" },
      include: {
        student: { select: { id: true, name: true, phone: true, educationalStage: true } },
      },
    });

    const courses = await prisma.course.findMany({
      where: { teacherId: t.id },
      select: { id: true, title: true, educationalStage: true, bookingKind: true },
    });

    if (courses.length === 0 || subs.length === 0) continue;

    console.log(`\nTeacher: ${t.name} (${t.id}) - ${subs.length} active subs, ${courses.length} courses`);

    let createdCount = 0;

    for (const sub of subs) {
      const student = sub.student;
      if (!student) continue;

      const stage = sub.educationalStage || student.educationalStage || "sec_2";
      const isLanguages = sub.languageTrack === "languages" || /لغات|english/i.test(sub.planLabel);

      // Match the Month 1 course for this teacher
      const month1Course = courses.find((c) => {
        const title = c.title;
        // MUST BE MONTH 1 (NOT MONTH 2, NOT REVISION)
        const isMonth1 =
          /الشهر\s*(الأول|الاول|1)|شهر\s*(1|أكتوبر|اكتوبر)|باقة\s*الشهر\s*الاول/i.test(title) &&
          !/الشهر\s*(الثاني|التاني|2)/i.test(title);

        if (!isMonth1) return false;

        // Stage match
        const courseStage = c.educationalStage;
        if (courseStage && stage && courseStage !== "الكل" && stage !== "الكل" && courseStage !== stage) {
          // If stage doesn't match, check title
          if (/أولى|اولي/i.test(title) && !/sec_1/i.test(stage)) return false;
          if (/ثانية|تانية|بكالوريا/i.test(title) && !/sec_2/i.test(stage)) return false;
        }

        // Track match
        const courseIsLang = /لغات|english|programming/i.test(title) && !/برمجة\s*عربي/i.test(title);
        return isLanguages ? courseIsLang : !courseIsLang;
      });

      if (month1Course) {
        const exists = await prisma.courseEnrollment.findUnique({
          where: {
            studentId_courseId: {
              studentId: student.id,
              courseId: month1Course.id,
            },
          },
        });

        if (!exists) {
          await prisma.courseEnrollment.create({
            data: {
              studentId: student.id,
              courseId: month1Course.id,
              fulfillmentSource: "ADMIN",
              amountPaid: sub.amount || 0,
            },
          });
          createdCount++;
          console.log(`  + Enrolled ${student.name} (${student.phone}) into: ${month1Course.title}`);
        }
      }
    }

    console.log(`Teacher ${t.name}: Enrolled ${createdCount} new students explicitly into Month 1.`);
  }

  console.log("\n✅ BACKFILL COMPLETE!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
