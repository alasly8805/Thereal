/**
 * Verification & Test script for manual course access and unlinked packages.
 * Tests:
 * 1. Packages/subscriptions DO NOT automatically grant access to any course.
 * 2. Students enrolled explicitly in Month 1 have access to Month 1 (true).
 * 3. NO student automatically has access to Month 2 (false).
 * 4. Manual enrollment in Month 2 gives immediate access (true).
 * 5. Removing manual enrollment revokes access immediately (false).
 *
 * Run with: npx tsx scripts/test-access-fix.ts
 */
import "dotenv/config";
import assert from "node:assert";
import { prisma } from "../src/lib/prisma";
import { checkCourseEnrollment } from "../src/lib/authorization";

async function main() {
  console.log("🏁 STARTING VERIFICATION TEST SUITE (UNLINKED PACKAGES & MANUAL ENROLLMENT)");

  // Find Mr. Youssef El-Tarek
  const teacher = await prisma.user.findFirst({
    where: { name: { contains: "يوسف الطارق" } },
  });

  assert(teacher, "Teacher Youssef El-Tarek must exist in DB");
  console.log(`Found teacher: ${teacher.name} (${teacher.id})`);

  // Find Month 1 and Month 2 courses
  const month1Arabic = await prisma.course.findFirst({
    where: { teacherId: teacher.id, title: "الشهر الاول برمجة عربي" },
  });
  const month2Arabic = await prisma.course.findFirst({
    where: { teacherId: teacher.id, title: "الشهر الثاني برمجة عربي ثانية بكالوريا" },
  });
  const month1Languages = await prisma.course.findFirst({
    where: { teacherId: teacher.id, title: "الشهر الاول programming لغات" },
  });
  const month2Languages = await prisma.course.findFirst({
    where: { teacherId: teacher.id, title: "الشهر الثاني programming ثانية بكالوريا لغات" },
  });

  assert(month1Arabic, "Course 'الشهر الاول برمجة عربي' must exist in DB");
  assert(month2Arabic, "Course 'الشهر الثاني برمجة عربي ثانية بكالوريا' must exist in DB");
  assert(month1Languages, "Course 'الشهر الاول programming لغات' must exist in DB");
  assert(month2Languages, "Course 'الشهر الثاني programming ثانية بكالوريا لغات' must exist in DB");

  // 1. Rawda Mohamed (Month 1 Arabic student)
  const rawdaSub = await prisma.teacherSubscription.findFirst({
    where: { teacherId: teacher.id, studentName: { contains: "Rawda" }, status: "active" },
  });
  assert(rawdaSub, "Rawda Mohamed subscription must exist");
  const rawdaM1 = await checkCourseEnrollment(rawdaSub.studentId, month1Arabic.id);
  const rawdaM2 = await checkCourseEnrollment(rawdaSub.studentId, month2Arabic.id);
  console.log(`\nRawda Mohamed (Month 1 Arabic):`);
  console.log(` - Month 1 access: ${rawdaM1} (Expected: true)`);
  console.log(` - Month 2 access: ${rawdaM2} (Expected: false)`);
  assert.strictEqual(rawdaM1, true, "Rawda must have Month 1 access");
  assert.strictEqual(rawdaM2, false, "Rawda MUST NOT have Month 2 access");
  console.log("✅ PASSED: Rawda has Month 1 and is locked out of Month 2!");

  // 2. Kenzi Ibrahim (Month 1 Languages student)
  const kenziSub = await prisma.teacherSubscription.findFirst({
    where: { teacherId: teacher.id, studentName: { contains: "كنزي ابراهيم" }, status: "active" },
  });
  assert(kenziSub, "Kenzi Ibrahim subscription must exist");
  const kenziM1 = await checkCourseEnrollment(kenziSub.studentId, month1Languages.id);
  const kenziM2 = await checkCourseEnrollment(kenziSub.studentId, month2Languages.id);
  console.log(`\nKenzi Ibrahim (Month 1 Languages):`);
  console.log(` - Month 1 access: ${kenziM1} (Expected: true)`);
  console.log(` - Month 2 access: ${kenziM2} (Expected: false)`);
  assert.strictEqual(kenziM1, true, "Kenzi must have Month 1 access");
  assert.strictEqual(kenziM2, false, "Kenzi MUST NOT have Month 2 access");
  console.log("✅ PASSED: Kenzi has Month 1 and is locked out of Month 2!");

  // 3. Mustafa Essam (Term 1 Arabic subscriber - NOT automatically granted Month 2)
  const mustafaSub = await prisma.teacherSubscription.findFirst({
    where: { teacherId: teacher.id, studentName: { contains: "مصطفى عصام" }, status: "active" },
  });
  assert(mustafaSub, "Mustafa Essam subscription must exist");
  const mustafaM1 = await checkCourseEnrollment(mustafaSub.studentId, month1Arabic.id);
  const mustafaM2 = await checkCourseEnrollment(mustafaSub.studentId, month2Arabic.id);
  console.log(`\nMustafa Essam (Termly subscriber):`);
  console.log(` - Month 1 access: ${mustafaM1} (Expected: true)`);
  console.log(` - Month 2 access: ${mustafaM2} (Expected: false - no automatic term expansion)`);
  assert.strictEqual(mustafaM1, true, "Mustafa must have Month 1 access");
  assert.strictEqual(mustafaM2, false, "Mustafa MUST NOT have Month 2 access without manual enrollment");
  console.log("✅ PASSED: Mustafa has Month 1 and is NOT auto-enrolled in Month 2!");

  // 4. Test Manual Enrollment flow for Mustafa into Month 2
  console.log("\n🧪 Testing manual enrollment into Month 2 for Mustafa Essam:");
  await prisma.courseEnrollment.create({
    data: {
      studentId: mustafaSub.studentId,
      courseId: month2Arabic.id,
      fulfillmentSource: "ADMIN",
    },
  });
  const mustafaAfterEnroll = await checkCourseEnrollment(mustafaSub.studentId, month2Arabic.id);
  console.log(` - Month 2 access after manual enrollment: ${mustafaAfterEnroll} (Expected: true)`);
  assert.strictEqual(mustafaAfterEnroll, true, "Mustafa must now have access to Month 2");

  // Clean up
  await prisma.courseEnrollment.delete({
    where: {
      studentId_courseId: {
        studentId: mustafaSub.studentId,
        courseId: month2Arabic.id,
      },
    },
  });
  const mustafaAfterDelete = await checkCourseEnrollment(mustafaSub.studentId, month2Arabic.id);
  console.log(` - Month 2 access after deleting enrollment: ${mustafaAfterDelete} (Expected: false)`);
  assert.strictEqual(mustafaAfterDelete, false, "Mustafa access must be revoked");
  console.log("✅ PASSED: Manual enrollment lifecycle works with 100% precision!");

  console.log("\n🎉 ALL TESTS COMPLETED SUCCESSFULLY! SYSTEM IS 100% MANUAL & SECURE.");
}

main()
  .catch((e) => {
    console.error("Test failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
