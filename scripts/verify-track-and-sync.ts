import { prisma } from "../src/lib/prisma";
import { getCourseLanguageTrack, isSubscriptionTrackMatching } from "../src/lib/course-track";
import { checkCourseEnrollment } from "../src/lib/authorization";

async function runTests() {
  console.log('🧪 Running Verification Tests for Track Access & Video Sync...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  const langCourseId = 'cmtr5aiko00zkqwwv03ucyju7'; // الشهر الاول لغات
  const arCourseId = 'cmtqhrxrh0013qw6iec0ikr89';   // الشهر الاول عربي

  // Test 1: Helper functions
  assert(getCourseLanguageTrack({ title: 'الشهر الاول لغات' }) === 'languages', 'getCourseLanguageTrack identifies "الشهر الاول لغات" as languages');
  assert(getCourseLanguageTrack({ title: 'الشهر الاول عربي' }) === 'arabic', 'getCourseLanguageTrack identifies "الشهر الاول عربي" as arabic');
  assert(getCourseLanguageTrack({ title: 'كورس تأسيسي' }) === 'all', 'getCourseLanguageTrack identifies "كورس تأسيسي" as all');

  assert(isSubscriptionTrackMatching('languages', 'languages') === true, 'Languages subscription matches languages course');
  assert(isSubscriptionTrackMatching('arabic', 'languages') === false, 'Arabic subscription does NOT match languages course');
  assert(isSubscriptionTrackMatching('languages', 'arabic') === false, 'Languages subscription does NOT match arabic course');
  assert(isSubscriptionTrackMatching('arabic', 'arabic') === true, 'Arabic subscription matches arabic course');
  assert(isSubscriptionTrackMatching('arabic', 'all') === true, 'Arabic subscription matches general course');
  assert(isSubscriptionTrackMatching('languages', 'all') === true, 'Languages subscription matches general course');

  // Test 2: Database checkCourseEnrollment logic
  // Arabic student: مصطفى وهبه ابراهيم (cmtovqyvy00ppqw3yqbsu1xw6)
  const arStudentId = 'cmtovqyvy00ppqw3yqbsu1xw6';
  // Language student: كيرلس وليم (cmt4h536v002eqx3es9032cll)
  const langStudentId = 'cmt4h536v002eqx3es9032cll';

  const arStudentArAccess = await checkCourseEnrollment(arStudentId, arCourseId, 'student');
  assert(arStudentArAccess === true, 'Arabic student has access to Arabic course');

  const arStudentLangAccess = await checkCourseEnrollment(arStudentId, langCourseId, 'student');
  assert(arStudentLangAccess === false, 'Arabic student does NOT have access to Language course');

  const langStudentLangAccess = await checkCourseEnrollment(langStudentId, langCourseId, 'student');
  assert(langStudentLangAccess === true, 'Languages student has access to Language course');

  const langStudentArAccess = await checkCourseEnrollment(langStudentId, arCourseId, 'student');
  assert(langStudentArAccess === false, 'Languages student does NOT have access to Arabic course');

  // Test 3: Video Watch Sync
  // For student cmtg6qsok0079qxxv6e18d8jm who watched cmtra50vd01icqwpdnuplfh68
  const syncStudentId = 'cmtg6qsok0079qxxv6e18d8jm';
  const relatedVideos = [
    'cmtra50vd01icqwpdnuplfh68',
    'cmtra4die01i9qwpdnle0ybnn',
    'cmtra8wyw01k7qwpdv600m6fo',
    'cmtra9rnv01ksqwpdnzmnzkxv'
  ];

  const progressRecords = await prisma.progress.findMany({
    where: {
      studentId: syncStudentId,
      videoId: { in: relatedVideos }
    }
  });

  const watchedCount = progressRecords.filter(p => p.watched).length;
  assert(watchedCount === 4, `All 4 equivalent videos are synchronized to watched=true (found: ${watchedCount}/4)`);

  console.log(`\nResults: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

runTests().catch(console.error).finally(() => prisma.$disconnect());
