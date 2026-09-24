process.env.NODE_ENV = 'test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

async function importFresh<T>(specifier: string): Promise<T> {
  const url = new URL(specifier, import.meta.url);
  url.searchParams.set('t', `${Date.now()}-${Math.random()}`);
  return import(url.href) as Promise<T>;
}

async function testPhoneNormalization() {
  const { normalizeEgyptPhone, formatDisplayPhone } = await importFresh<typeof import('../src/lib/phone.ts')>('../src/lib/phone.ts');

  assert.equal(normalizeEgyptPhone('01012345678'), '+201012345678');
  assert.equal(normalizeEgyptPhone('+201012345678'), '+201012345678');
  assert.equal(normalizeEgyptPhone('201012345678'), '+201012345678');
  assert.equal(formatDisplayPhone('+201012345678'), '01012345678');
  assert.throws(() => normalizeEgyptPhone('12345'), /رقم الهاتف غير صالح/);
}

async function testDevMockSms() {
  process.env.DEV_SKIP_SMS = 'true';
  process.env.TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || 'AC00000000000000000000000000000000';
  process.env.TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || 'x'.repeat(32);
  process.env.TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || '+201000000000';
  delete process.env.TWILIO_USE_VERIFY;

  const mod = await importFresh<typeof import('../src/lib/twilio.ts')>('../src/lib/twilio.ts');
  const result = await mod.sendVerificationSms('01012345678', '123456');

  assert.equal(result.method, 'dev');
  assert.equal(result.code, '123456');
  assert.equal(result.dev, true);
}

async function testVerifySmsRequestShape() {
  process.env.DEV_SKIP_SMS = 'false';
  process.env.TWILIO_USE_VERIFY = 'true';
  process.env.TWILIO_VERIFY_SERVICE_SID = 'VA11111111111111111111111111111111';
  process.env.TWILIO_API_KEY_SID = 'SK11111111111111111111111111111111';
  process.env.TWILIO_API_SECRET = 's'.repeat(32);

  const calls: Array<{ url: string; options: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), options: init || {} });
    return new Response(JSON.stringify({ sid: 'VE123', status: 'pending' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const mod = await importFresh<typeof import('../src/lib/twilio.ts')>('../src/lib/twilio.ts');
    const result = await mod.sendVerificationSms('01012345678', '654321');

    assert.equal(result.method, 'verify');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /verify\.twilio\.com\/v2\/Services\/VA11111111111111111111111111111111\/Verifications$/);

    const body = String(calls[0].options.body || '');
    assert.match(body, /To=%2B201012345678/);
    assert.match(body, /Channel=sms/);

    const auth = String(calls[0].options.headers && (calls[0].options.headers as Record<string, string>).Authorization || '');
    assert.ok(auth.startsWith('Basic '));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testWhatsAppPayloadShape() {
  process.env.WHATSAPP_PERMANENT_TOKEN = 'mock-whatsapp-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'mock-phone-id';
  process.env.WHATSAPP_OTP_TEMPLATE_NAME = 'codeup';
  process.env.WHATSAPP_OTP_TEMPLATE_LANG = 'en';
  process.env.WHATSAPP_PARAMETER_NAME = 'text';
  process.env.WHATSAPP_TEMPLATE_HAS_BUTTON = 'false';
  delete process.env.WHATSAPP_OFFLINE;

  const calls: Array<{ url: string; options: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), options: init || {} });
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const { sendOtpWhatsApp } = await importFresh<typeof import('../src/lib/whatsapp.ts')>('../src/lib/whatsapp.ts');
    await sendOtpWhatsApp('01012345678', '987654');

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /graph\.facebook\.com\/v25\.0\/mock-phone-id\/messages$/);

    const body = JSON.parse(String(calls[0].options.body || '{}'));
    assert.equal(body.messaging_product, 'whatsapp');
    assert.equal(body.to, '201012345678');
    assert.equal(body.template.name, 'codeup');
    assert.equal(body.template.language.code, 'en');
    
    // Check parameters and named parameter support
    const components = body.template.components;
    assert.equal(components.length, 1); // Only body, no button
    assert.equal(components[0].type, 'body');
    assert.equal(components[0].parameters[0].type, 'text');
    assert.equal(components[0].parameters[0].text, '987654');
    assert.equal(components[0].parameters[0].parameter_name, 'text'); // Named parameter support
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testZadxOtpRequestShape() {
  process.env.DEV_SKIP_SMS = 'false';
  delete process.env.BYPASS_PHONE_VERIFICATION;
  process.env.SMS_PROVIDER = 'zadx';
  process.env.ZADX_API_KEY = 'pk_test_key';
  process.env.ZADX_API_SECRET = 'sk_test_secret';
  process.env.ZADX_SENDER_ID = 'ZADX';
  process.env.ZADX_LOCALE = 'ar';

  const calls: Array<{ url: string; options: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), options: init || {} });
    return new Response(JSON.stringify({
      id: 4127,
      status: 'sent',
      to: '+201012345678',
      sender_id: 'ZADX',
      cost_credits: 1,
      remaining_credits: 996,
    }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const mod = await importFresh<typeof import('../src/lib/zadx-sms.ts')>('../src/lib/zadx-sms.ts');
    const result = await mod.sendVerificationSms('01012345678', '482917');

    assert.equal(result.method, 'zadx');
    assert.equal(result.id, 4127);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://smsapi.zadx.net/api/v1/otp/send');

    const headers = calls[0].options.headers as Record<string, string>;
    assert.equal(headers['X-Api-Key'], 'pk_test_key');
    assert.equal(headers['X-Api-Secret'], 'sk_test_secret');
    assert.equal(headers['Idempotency-Key'], 'otp-+201012345678-482917');

    const body = JSON.parse(String(calls[0].options.body || '{}'));
    assert.equal(body.to, '+201012345678');
    assert.equal(body.otp, '482917');
    assert.equal(body.sender_id, 'ZADX');
    assert.equal(body.locale, 'ar');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testWhatsAppOfflineSkipsToSms() {
  process.env.WHATSAPP_OFFLINE = 'true';
  process.env.DEV_SKIP_SMS = 'true';
  process.env.WHATSAPP_PERMANENT_TOKEN = 'should-not-be-used';
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'should-not-be-used';

  const originalFetch = globalThis.fetch;
  let graphCalls = 0;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('graph.facebook.com')) graphCalls += 1;
    return originalFetch(input, init);
  };

  try {
    const { sendVerificationCode } = await importFresh<typeof import('../src/lib/whatsapp.ts')>('../src/lib/whatsapp.ts');
    const result = await sendVerificationCode('01012345678', '112233');
    assert.equal(result.channel, 'sms');
    assert.equal(graphCalls, 0, 'WHATSAPP_OFFLINE must not call Meta');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.WHATSAPP_OFFLINE;
  }
}

async function testWhatsAppFallbackToSms() {
  process.env.WHATSAPP_PERMANENT_TOKEN = 'mock-whatsapp-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'mock-phone-id';
  process.env.WHATSAPP_OTP_TEMPLATE_NAME = 'codeup';
  process.env.DEV_SKIP_SMS = 'true';
  delete process.env.WHATSAPP_OFFLINE;
  process.env.TWILIO_ACCOUNT_SID = 'AC123';
  process.env.TWILIO_FROM_NUMBER = '+123';
  process.env.TWILIO_AUTH_TOKEN = 'token';
  delete process.env.TWILIO_USE_VERIFY;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    // Force a WhatsApp API failure (e.g. invalid template / token error)
    if (String(input).includes('graph.facebook.com')) {
      return new Response(JSON.stringify({ error: { message: 'Template not found' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // Success for Twilio
    return new Response(JSON.stringify({ sid: 'SM123' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const { sendVerificationCode } = await importFresh<typeof import('../src/lib/whatsapp.ts')>('../src/lib/whatsapp.ts');
    const result = await sendVerificationCode('01012345678', '112233');

    // Should fall back to SMS automatically on WhatsApp failure
    assert.equal(result.channel, 'sms');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testVerifiedPaymentAmountBinding() {
  const { checkVerifiedPaymentAmount } = await importFresh<typeof import('../src/lib/payment-amount.ts')>('../src/lib/payment-amount.ts');

  assert.equal(checkVerifiedPaymentAmount({
    providerAmount: '102.50',
    pendingBaseAmount: 100,
    note: 'provider_ref:abc|base:100|total:102.5',
  }).valid, true);

  assert.equal(checkVerifiedPaymentAmount({
    providerAmount: 1,
    pendingBaseAmount: 100,
    note: 'provider_ref:abc|base:100|total:102.5',
  }).valid, false, 'a paid status with the wrong amount must not credit the wallet');

  assert.equal(checkVerifiedPaymentAmount({
    providerAmount: undefined,
    pendingBaseAmount: 100,
    note: 'provider_ref:abc|base:100|total:102.5',
  }).valid, false, 'missing provider amounts must fail closed');
}

async function testCurrencyAmountValidation() {
  const { isValidCurrencyAmount } = await importFresh<typeof import('../src/lib/price-verifier.ts')>('../src/lib/price-verifier.ts');

  assert.equal(isValidCurrencyAmount(100), true);
  assert.equal(isValidCurrencyAmount(-1), false, 'negative prices must never create paid access');
  assert.equal(isValidCurrencyAmount(0), false, 'wallet top-ups must be positive');
  assert.equal(isValidCurrencyAmount(0, true), true, 'explicitly free plans remain supported');
  assert.equal(isValidCurrencyAmount(Number.NaN), false);
  assert.equal(isValidCurrencyAmount(Number.POSITIVE_INFINITY), false);
  assert.equal(isValidCurrencyAmount('100'), false, 'currency amounts must be numeric server values');
}

async function testSecurityPatchInvariants() {
  const { readFile } = await import('node:fs/promises');
  const [drmPackage, nativeUpload, parentToken, parentLimiter, parentVerify, codesRoute, purchaseService] = await Promise.all([
    readFile(new URL('../src/app/api/teacher/drm-package/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/teacher/native-upload/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/whatsapp/parentToken.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/whatsapp/parentRateLimiter.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/parent/verify/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/codes/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/purchase/PurchaseService.ts', import.meta.url), 'utf8'),
  ]);

  const accessCodeFlow = codesRoute.slice(
    codesRoute.indexOf('const accessCode ='),
    codesRoute.indexOf('// 2. Check Plan Access Code')
  );
  assert.match(accessCodeFlow, /prisma\.\$transaction/,
    'access-code claims must execute inside a transaction');
  assert.match(accessCodeFlow, /accessCode\.updateMany[\s\S]*studentId:\s*null[\s\S]*isActive:\s*true/,
    'access-code claims must use an atomic unused-and-active condition');

  const moneyCodeFlow = purchaseService.slice(
    purchaseService.indexOf('static async processCombinedMoneyCodePurchase'),
    purchaseService.indexOf('// 7. SPLIT FUNDING FULFILLMENT')
  );
  assert.match(moneyCodeFlow, /return prisma\.\$transaction/,
    'money-code claim, wallet credit, and ledger write must share one transaction');
  assert.match(moneyCodeFlow, /moneyCode\.updateMany[\s\S]*isUsed:\s*false/,
    'money-code redemption must use an atomic unused-code claim');
  assert.match(moneyCodeFlow, /balance:\s*\{\s*increment:\s*codeRecord\.amount\s*\}/,
    'money-code value must be incremented server-side');
  assert.match(moneyCodeFlow, /balanceTransaction\.create/,
    'money-code redemption must write its ledger entry in the transaction');

  assert.match(drmPackage, /folder:\s*\{\s*course:\s*\{\s*teacherId:\s*session\.id\s*\}\s*\}/,
    'DRM packaging must scope stored videos to the authenticated teacher');
  assert.match(drmPackage, /rawVideoId\.startsWith\(`local_\$\{ownerId\}_`\)/,
    'pending local DRM uploads must carry the authenticated teacher prefix');
  assert.doesNotMatch(drmPackage, /possibleFiles\.find|f\.includes\(safeFilename\)|safeFilename\.includes\(f\)/,
    'DRM source resolution must not use attacker-controlled substring matching');
  assert.match(nativeUpload, /`local_\$\{ownerId\}_\$\{Date\.now\(\)\}_\$\{randomId\}\$\{ext\}`/,
    'native uploads must mint teacher-bound filenames');

  const confirmBody = parentToken.slice(
    parentToken.indexOf('export async function confirmParentToken'),
    parentToken.indexOf('export async function rejectParentToken')
  );
  assert.match(confirmBody, /new Date\(\) > parentToken\.expiresAt/,
    'expired parent links must not be confirmable');
  assert.match(confirmBody, /prisma\.\$transaction/,
    'parent confirmation must update token, student, and audit event atomically');
  assert.match(confirmBody, /expiresAt:\s*\{\s*gte:\s*now\s*\}/,
    'the confirmation write must conditionally re-check expiry inside the transaction');
  assert.match(confirmBody, /status:\s*\{\s*notIn:\s*\["REJECTED",\s*"REVOKED"\]\s*\}/,
    'the confirmation write must not overwrite a concurrent rejection or revocation');
  assert.match(parentLimiter, /parentVerificationRateLimiter = new ParentRateLimiter\(5\)/,
    'parent verification must be limited to five attempts per minute');
  assert.match(parentVerify, /parentVerificationRateLimiter\.checkRateLimit\(ip\)/,
    'the verification route must use the strict limiter');
}

async function testAiVideoAssessmentInvariants() {
  const { readFile } = await import('node:fs/promises');
  const [aiRoute, aiAssistant, watchRoute, watchPage, quizRoute, quizSubmit, homeworkSubmit] = await Promise.all([
    readFile(new URL('../src/app/api/ai/chat/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/ai-assistant.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/videos/[id]/watch/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/courses/[id]/watch/[videoId]/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/quizzes/[id]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/quizzes/[id]/submit/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/homework/[id]/submit/route.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(aiRoute, /MAX_ACTIVE_AI_REQUESTS\s*=\s*3/);
  assert.match(aiRoute, /req\.signal/);
  assert.match(aiAssistant, /PROVIDER_TIMEOUT_MS\s*=\s*12_000/);
  assert.match(aiAssistant, /providerSignal\(requestSignal\)/);
  assert.match(aiAssistant, /gemini-flash/);
  assert.match(aiAssistant, /GEMINI_KEY_3/);

  assert.match(watchRoute, /WATCH_DURATION_HOURS \* 60 \* 60 \* 1000/);
  assert.match(watchRoute, /heartbeatBody\.heartbeat/);
  assert.match(watchRoute, /heartbeatBody\.heartbeat/);
  assert.match(watchRoute, /videoWatchSession\.updateMany/);
  assert.match(watchPage, /heartbeat: true/);
  assert.match(quizRoute, /const \{ correctAnswer: _ca, \.\.\.q \}/);
  assert.match(quizSubmit, /elapsedSeconds > limitMinutes \* 60/);
  assert.match(quizSubmit, /quiz-submit:\$\{session\.id\}:\$\{quizId\}/);
  assert.match(quizSubmit, /if \(existingResult\.completedAt\)/, 'a completed quiz must lock even at 0% and even when allowRetake is true');
  assert.match(quizSubmit, /ابدأ المحاولة الجديدة من زر/, 'submit must send the student back to Start new attempt instead of overwriting the sheet');
  assert.match(homeworkSubmit, /hw\.dueAt && new Date\(\) > hw\.dueAt/);
  assert.match(homeworkSubmit, /err\?\.code === "P2002"/);
  assert.match(homeworkSubmit, /alreadySubmitted: true/, 'homework must refuse a second graded submit');
  assert.match(homeworkSubmit, /canReplaceRejectedHomeworkUpload/, 'rejected PDF homework can be replaced without a teacher retry toggle');
}

async function testQuizRetakeInvariants() {
  const { readFile } = await import('node:fs/promises');
  const [quizRoute, quizSubmit, quizPage, startRetake, draftRoute, teacherPatch, examDashboard] = await Promise.all([
    readFile(new URL('../src/app/api/quizzes/[id]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/quizzes/[id]/submit/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/quizzes/[id]/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/quizzes/[id]/start-retake/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/quizzes/[id]/draft/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/admin/quiz-results/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/admin/teacher/exam-dashboard/route.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(quizRoute, /if \(existingResult\?\.completedAt\) \{/, 'opening a submitted quiz must stay on the read-only sheet');
  assert.match(quizRoute, /opening this page must never clear completedAt/);
  assert.doesNotMatch(
    quizRoute,
    /data: \{ startedAt: new Date\(\), completedAt: null, allowRetake: false \}/,
    'GET must not reopen a graded attempt just because allowRetake is true'
  );
  assert.match(quizRoute, /draftAnswers: parseDraftAnswers/, 'in-progress GET must restore server drafts');

  assert.match(startRetake, /completedAt: null/, 'only Start new attempt may clear completedAt');
  assert.match(startRetake, /if \(!existing\.allowRetake\)/, 'start-retake requires the teacher flag');

  assert.match(teacherPatch, /data: \{ allowRetake \}/, 'teacher toggle is a flag only');
  assert.doesNotMatch(teacherPatch, /completedAt:\s*null/, 'teacher allow-retake must not wipe the sheet');
  assert.match(examDashboard, /data: \{ allowRetake: true \}/, 'allow-all-retakes is a flag only');
  assert.doesNotMatch(examDashboard, /completedAt:\s*null/, 'batch allow-retake must not wipe sheets');

  assert.match(quizSubmit, /if \(existingResult\.completedAt\)/, 'submit stays locked until start-retake');
  assert.match(quizSubmit, /if \(locked\?\.completedAt\)/, 'locked submit must ignore allowRetake');

  assert.match(quizPage, /بدء محاولة جديدة/, 'review page offers an explicit new attempt');
  assert.match(quizPage, /start-retake/, 'new attempt hits the dedicated route');
  assert.match(quizPage, /persistEssayDraft/, 'essay answers autosave while typing');
  assert.match(draftRoute, /existing\.completedAt/, 'draft route must refuse a completed sheet');
  assert.match(draftRoute, /draftAnswers: serializeDraftAnswers/, 'draft route persists answers');

  const {
    mergeDraftAnswers,
    parseDraftAnswers,
    serializeDraftAnswers,
    retakeCooldownRemainingMs,
  } = await importFresh<typeof import('../src/lib/quiz-attempt.ts')>('../src/lib/quiz-attempt.ts');
  assert.deepEqual(mergeDraftAnswers({ a: 'server' }, { a: 'local', b: 'new' }), { a: 'local', b: 'new' });
  assert.equal(parseDraftAnswers(serializeDraftAnswers({ q1: 'hello' })).q1, 'hello');
  assert.equal(retakeCooldownRemainingMs(new Date(), 0), 0);
}

async function testContentDependencyGraphInvariants() {
  const { readFile } = await import('node:fs/promises');
  const [watchRoute, quizRoute, quizSubmit, homeworkRoute, homeworkSubmit, videoComplete] = await Promise.all([
    readFile(new URL('../src/app/api/videos/[id]/watch/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/quizzes/[id]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/quizzes/[id]/submit/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/homework/[id]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/homework/[id]/submit/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/videos/[id]/complete/route.ts', import.meta.url), 'utf8'),
  ]);
  for (const route of [watchRoute, quizRoute, quizSubmit, homeworkRoute, homeworkSubmit]) {
    assert.match(route, /canAccessContent/, 'student content routes must use the generic access engine');
  }
  assert.match(videoComplete, /recordContentCompleted/, 'video completion must synchronize generic progress');
  assert.match(quizSubmit, /recordContentCompleted/, 'quiz completion must synchronize generic progress');
  assert.match(homeworkSubmit, /syncHomeworkContentProgress/, 'homework completion must synchronize generic progress from the submission status');
  assert.match(homeworkSubmit, /HOMEWORK_REVIEW_REQUESTED_STATUS/, 'PDF homework submit must set قيد المراجعة / review_requested');
  assert.match(homeworkSubmit, /uploadResubmit/, 'PDF submit must accept a قيد المراجعة row created by /upload');
  assert.doesNotMatch(homeworkSubmit, /afterRejection: hw\.type === "upload"/, 'PDF submit must not keep the next item locked after a re-upload');
  const homeworkUpload = await readFile(new URL('../src/app/api/homework/[id]/upload/route.ts', import.meta.url), 'utf8');
  assert.match(homeworkUpload, /syncHomeworkContentProgress/, 'PDF file persist must open the next item as قيد المراجعة');
  assert.match(homeworkUpload, /HOMEWORK_REVIEW_REQUESTED_STATUS/, 'PDF file persist must set review_requested so a dropped submit cannot leave the chain locked');
  assert.match(homeworkUpload, /canPersistPdfHomeworkUpload/, 'retried PDF uploads while قيد المراجعة must still persist and unlock');
  assert.doesNotMatch(homeworkUpload, /keepFailedUntilSubmit/, 'rejected PDF replacement must become قيد المراجعة on upload, not stay failed');
  const engineSrc = await readFile(new URL('../src/lib/content-access-engine.ts', import.meta.url), 'utf8');
  assert.match(engineSrc, /Homework unlock is always derived from the live submission/, 'stale IN_PROGRESS homework progress must not win over the PDF submission');
  assert.match(engineSrc, /const homeworkItems = items.filter/, 'homework progress overlay must run for every homework node, not only unresolved ones');
  assert.match(engineSrc, /HOMEWORK_REVIEW_REQUESTED_STATUS/, 'lock engine must treat قيد المراجعة as completed progress');
  assert.match(engineSrc, /export async function canAccessContent/, 'student access must go through canAccessContent');
  assert.match(engineSrc, /export async function getCourseContentLocks/, 'course sidebar locks must go through getCourseContentLocks');
  assert.doesNotMatch(engineSrc, /homeworkNeedsAcceptanceAfterReject/, 'review_requested must unlock even when a previous reject review row still exists');
  const courseRoute = await readFile(new URL('../src/app/api/courses/[id]/route.ts', import.meta.url), 'utf8');
  assert.match(courseRoute, /getCourseContentLocks/, 'student course payload must evaluate chain locks on the server');
  assert.match(courseRoute, /chainLocks\.has\(hw\.id\)/, 'homework nodes in the course payload must carry chain lock state');
  assert.match(courseRoute, /chainLocks\.has\(q\.id\)/, 'quiz nodes in the course payload must carry chain lock state');
  assert.match(courseRoute, /chainLocks\.has\(m\.id\)/, 'material nodes in the course payload must carry chain lock state');

  const reviewRoute = await readFile(new URL('../src/app/api/homework/[id]/review/route.ts', import.meta.url), 'utf8');
  assert.match(reviewRoute, /syncHomeworkContentProgress/, 'teacher accept/reject must rewrite homework progress');
  assert.match(reviewRoute, /status: body\.verdict/, 'teacher verdict must become the submission status');

  const {
    ContentProgressStatus,
    ContentType,
    evaluateContentAccess,
    isContentClosed,
    CONTENT_CLOSED_MESSAGE,
  } = await importFresh<typeof import('../src/lib/content-access-engine.ts')>('../src/lib/content-access-engine.ts');

  const solutionVideo = { id: 'solution-video', title: 'فيديو الحل', type: ContentType.SOLUTION_VIDEO };
  const exam = { id: 'exam', title: 'الامتحان', type: ContentType.EXAM };
  const lessonVideo = { id: 'lesson-video', title: 'الدرس', type: ContentType.VIDEO };
  const homework = { id: 'homework', title: 'الواجب', type: ContentType.HOMEWORK };

  const graph = {
    items: [solutionVideo, exam, lessonVideo, homework],
    prerequisites: [
      { targetContentId: exam.id, prerequisiteContentId: solutionVideo.id },
      { targetContentId: homework.id, prerequisiteContentId: lessonVideo.id },
    ],
  };

  const blockedExam = evaluateContentAccess({
    ...graph,
    targetContentId: exam.id,
    progress: [],
  });
  assert.equal(blockedExam.allowed, false);
  assert.equal(blockedExam.requiredItem.id, solutionVideo.id,
    'an exam remains blocked while its solution video is unwatched');

  const blockedHomework = evaluateContentAccess({
    ...graph,
    targetContentId: homework.id,
    progress: [],
  });
  assert.equal(blockedHomework.allowed, false);
  assert.equal(blockedHomework.requiredItem.id, lessonVideo.id,
    'homework remains blocked while its lesson video is unwatched');

  const unlocked = evaluateContentAccess({
    ...graph,
    targetContentId: exam.id,
    progress: [{
      contentId: solutionVideo.id,
      status: ContentProgressStatus.COMPLETED,
    }],
  });
  assert.equal(unlocked.allowed, true,
    'completing a prerequisite immediately unlocks the dependent item');

  const indirect = evaluateContentAccess({
    items: [solutionVideo, lessonVideo, exam],
    prerequisites: [
      { targetContentId: exam.id, prerequisiteContentId: lessonVideo.id },
      { targetContentId: lessonVideo.id, prerequisiteContentId: solutionVideo.id },
    ],
    targetContentId: exam.id,
    progress: [
      { contentId: solutionVideo.id, status: ContentProgressStatus.COMPLETED },
      { contentId: lessonVideo.id, status: ContentProgressStatus.COMPLETED },
    ],
  });
  assert.equal(indirect.allowed, true, 'indirect prerequisite chains are traversed');

  const closeAt = new Date('2026-01-01T00:00:00Z');
  const afterClose = new Date('2026-01-01T01:00:00Z');
  const studentId = 'stu-1';
  assert.equal(
    isContentClosed({ enableAutoClose: true, closeAt, now: afterClose, studentId }),
    true,
    'past close_at with auto-close must block',
  );
  assert.equal(
    isContentClosed({
      enableAutoClose: true,
      closeAt,
      now: afterClose,
      studentId,
      extensions: [{ studentId, extendedUntil: new Date('2026-01-01T02:00:00Z') }],
    }),
    false,
    'a per-student extension that is still open must allow access',
  );
  assert.equal(
    isContentClosed({
      enableAutoClose: true,
      closeAt,
      now: afterClose,
      studentId,
      extensions: [{ studentId: null, extendedUntil: new Date('2026-01-01T02:00:00Z') }],
    }),
    false,
    'an ALL-students extension must allow access',
  );
  assert.equal(
    isContentClosed({
      enableAutoClose: true,
      closeAt,
      now: afterClose,
      studentId,
      extensions: [{ studentId: 'other', extendedUntil: new Date('2026-01-01T02:00:00Z') }],
    }),
    true,
    'another student\'s extension must not reopen this student',
  );
  assert.equal(CONTENT_CLOSED_MESSAGE, 'انتهى وقت الامتحان');
  assert.match(engineSrc, /export function isContentClosed/, 'timed close must live in isContentClosed');

  await testPdfHomeworkUnlockFlow();
}

/**
 * Production PDF homework chain (homework → next video), matching the live
 * student/teacher routes: any PDF upload/submit sets review_requested and
 * COMPLETED, that status opens the next item, accept keeps it open, reject
 * closes it until the student uploads again.
 */
async function testPdfHomeworkUnlockFlow() {
  const {
    ContentProgressStatus,
    ContentType,
    evaluateContentAccess,
    homeworkOpensNextContent,
    homeworkProgressStatusFromSubmission,
    canPersistPdfHomeworkUpload,
    HOMEWORK_REVIEW_REQUESTED_STATUS,
  } = await importFresh<typeof import('../src/lib/content-access-engine.ts')>('../src/lib/content-access-engine.ts');

  assert.equal(HOMEWORK_REVIEW_REQUESTED_STATUS, 'review_requested');
  assert.equal(canPersistPdfHomeworkUpload('upload', undefined, false), true,
    'first PDF upload must be allowed');
  assert.equal(canPersistPdfHomeworkUpload('upload', 'review_requested', false), true,
    'retried PDF upload while قيد المراجعة must be allowed so later students are not stuck on 409');
  assert.equal(canPersistPdfHomeworkUpload('upload', 'failed', false), true,
    'rejected PDF must be replaceable without a teacher retry toggle');
  assert.equal(canPersistPdfHomeworkUpload('upload', 'passed', false), false,
    'accepted PDF must stay locked until the teacher reopens the attempt');

  assert.equal(homeworkOpensNextContent('review_requested'), true,
    'قيد المراجعة must unlock the next content on first PDF upload');
  assert.equal(homeworkOpensNextContent('passed'), true,
    'teacher accept must keep the next content unlocked');
  assert.equal(homeworkOpensNextContent('failed'), false,
    'teacher reject must lock the next content');
  assert.equal(homeworkOpensNextContent('review_requested', { reviewVerdict: 'failed' }), true,
    're-upload after reject is قيد المراجعة again and must unlock until the next verdict');
  assert.equal(homeworkOpensNextContent('pending'), false, 'unsubmitted/pending homework must not open the chain');
  assert.equal(
    homeworkOpensNextContent('pending', { hasUploadedFile: true }),
    true,
    'legacy PDF rows stored as pending after upload must unlock like قيد المراجعة'
  );
  assert.equal(
    homeworkProgressStatusFromSubmission('review_requested'),
    ContentProgressStatus.COMPLETED,
    'PDF submit under review must write COMPLETED progress'
  );
  assert.equal(
    homeworkProgressStatusFromSubmission('failed'),
    ContentProgressStatus.IN_PROGRESS,
    'teacher reject must write IN_PROGRESS so the next item locks'
  );

  const homework = { id: 'hw-pdf', title: 'واجب PDF', type: ContentType.HOMEWORK };
  const nextVideo = { id: 'next-video', title: 'الدرس التالي', type: ContentType.VIDEO };
  const graph = {
    items: [homework, nextVideo],
    prerequisites: [{ targetContentId: nextVideo.id, prerequisiteContentId: homework.id }],
    targetContentId: nextVideo.id,
  };

  const lockedBeforeUpload = evaluateContentAccess({ ...graph, progress: [] });
  assert.equal(lockedBeforeUpload.allowed, false, 'next video stays locked before any PDF upload');

  const underReview = evaluateContentAccess({
    ...graph,
    progress: [{
      contentId: homework.id,
      status: homeworkProgressStatusFromSubmission('review_requested'),
    }],
  });
  assert.equal(underReview.allowed, true, 'next video unlocks while the PDF is قيد المراجعة');

  const staleInProgressIgnored = evaluateContentAccess({
    ...graph,
    progress: [{
      contentId: homework.id,
      status: homeworkProgressStatusFromSubmission('review_requested', { hasUploadedFile: true }),
    }],
  });
  assert.equal(
    staleInProgressIgnored.allowed,
    true,
    'live review_requested submission must open the next video even if stored graph progress was left IN_PROGRESS'
  );

  const accepted = evaluateContentAccess({
    ...graph,
    progress: [{
      contentId: homework.id,
      status: homeworkProgressStatusFromSubmission('passed'),
    }],
  });
  assert.equal(accepted.allowed, true, 'next video stays unlocked after teacher accept');

  const rejected = evaluateContentAccess({
    ...graph,
    progress: [{
      contentId: homework.id,
      status: homeworkProgressStatusFromSubmission('failed'),
    }],
  });
  assert.equal(rejected.allowed, false, 'next video locks again after teacher reject');
  if (rejected.allowed === false) {
    assert.equal(rejected.requiredItem.id, homework.id);
  }

  const reuploaded = evaluateContentAccess({
    ...graph,
    progress: [{
      contentId: homework.id,
      status: homeworkProgressStatusFromSubmission('review_requested', { reviewVerdict: 'failed' }),
    }],
  });
  assert.equal(reuploaded.allowed, true, 're-upload after reject unlocks again while قيد المراجعة');

  const acceptedAfterRetry = evaluateContentAccess({
    ...graph,
    progress: [{
      contentId: homework.id,
      status: homeworkProgressStatusFromSubmission('passed'),
    }],
  });
  assert.equal(acceptedAfterRetry.allowed, true, 'teacher accept of the replacement PDF unlocks again');
}

async function testCurriculumPracticeInvariants() {
  const { readFile } = await import('node:fs/promises');
  const [questionsSource, apiRoute, practiceComponent, programmingPage, environmentsPage, chunksSource] = await Promise.all([
    readFile(new URL('../src/lib/curriculum-programming-questions.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/curriculum/practice/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/environments/CurriculumPractice.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/(clerk)/environments/programming/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/(clerk)/environments/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/ai/knowledge/curriculum/curriculum_chunks.json', import.meta.url), 'utf8'),
  ]);

  const { CURRICULUM_QUESTIONS } = await importFresh<typeof import('../src/lib/curriculum-programming-questions.ts')>('../src/lib/curriculum-programming-questions.ts');
  assert.ok(CURRICULUM_QUESTIONS.length >= 5, 'official curriculum practice bank must contain representative questions');
  assert.ok(CURRICULUM_QUESTIONS.every((question) => question.choices.length === 4), 'every question must have four choices');
  assert.ok(CURRICULUM_QUESTIONS.every((question) => question.revisionPrompt.length > 0), 'wrong answers must point to a revision lesson');

  const chunks = JSON.parse(chunksSource) as Array<{ lesson_number: string; book_page_start: number; book_page_end: number; source_file: string }>;
  for (const question of CURRICULUM_QUESTIONS) {
    const lessonChunks = chunks.filter((chunk) => chunk.lesson_number === question.lessonNumber && chunk.source_file === question.sourceFile);
    assert.ok(lessonChunks.length > 0, `question ${question.id} must cite an official curriculum lesson`);
    assert.ok(question.bookPage >= Math.min(...lessonChunks.map((chunk) => chunk.book_page_start)) && question.bookPage <= Math.max(...lessonChunks.map((chunk) => chunk.book_page_end)),
      `question ${question.id} citation must fall inside its lesson pages`);
  }

  assert.match(apiRoute, /getCurriculumQuestion/);
  assert.match(apiRoute, /revisionPrompt/);
  assert.match(apiRoute, /recordContentProgress/);
  assert.match(practiceComponent, /updateIQ/);
  assert.match(practiceComponent, /اسألي المساعد عن المفهوم/);
  assert.match(programmingPage, /tab === "curriculum"/);
  assert.match(programmingPage, /CurriculumPractice/);
  assert.match(environmentsPage, /أسئلة برمجة المنهج/);
  assert.match(environmentsPage, /\/environments\/programming\?tab=curriculum/);
}

/**
 * Teacher-panel "اجعله تجريبياً" must PATCH a real JSON handler.
 * Production previously hit PATCH /api/admin/folders/:id/videos, which only
 * exported POST+DELETE. Next.js answered 405 HTML, res.json() threw, and the
 * UI showed "تعذر الاتصال بالخادم".
 */
async function testTeacherTrialVideoToggleInvariants() {
  const { readFile } = await import('node:fs/promises');
  const [studio, foldersVideos, videosPatch] = await Promise.all([
    readFile(new URL('../src/components/admin/teacher/TeacherCurriculumStudio.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/admin/folders/[id]/videos/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/admin/videos/[id]/route.ts', import.meta.url), 'utf8'),
  ]);

  const toggle = studio.slice(
    studio.indexOf('const handleToggleVideoFree'),
    studio.indexOf('const handleDeleteQuiz'),
  );
  assert.match(toggle, /\/api\/admin\/videos\/\$\{videoId\}/,
    'اجعله تجريبياً must PATCH the canonical video update route');
  assert.doesNotMatch(toggle, /\/api\/admin\/folders\/\$\{/,
    'اجعله تجريبياً must not PATCH the folders videos collection (that 405ed in production)');
  assert.match(toggle, /method:\s*"PATCH"/,
    'trial toggle must use PATCH');
  assert.match(toggle, /isFree:\s*!currentFree/,
    'trial toggle must send the inverted isFree flag');
  assert.match(toggle, /await res\.text\(\)/,
    'trial toggle must parse the body as text first so HTML 405 cannot look like a network outage');

  assert.match(foldersVideos, /export async function PATCH/,
    'folders videos route must accept PATCH so cached teacher-panel clients keep working');
  assert.match(foldersVideos, /data:\s*\{\s*isFree\s*\}/,
    'folders videos PATCH must persist isFree');
  assert.match(foldersVideos, /isFree:\s*body\.isFree === true/,
    'creating a video must persist the trial flag the upload modal already sends');

  assert.match(videosPatch, /export async function PATCH/,
    'canonical video route must expose PATCH');
  assert.match(videosPatch, /if \(typeof body\.isFree === "boolean"\)/,
    'canonical video PATCH must accept isFree');
}

/**
 * Support panel (/thefake/support) invariants.
 *
 * These are the properties that make the panel safe to hand to a support agent:
 * the discount ceiling is enforced on the server, entering a student's account
 * is read-only and free, and unlocking content does not forge coursework. Each
 * one is a silent failure if it regresses — a leaked write only shows up later
 * as a grade nobody can explain — so they are pinned here rather than left to
 * review.
 */
async function testSupportPanelInvariants() {
  const { readFile } = await import('node:fs/promises');
  const read = (p: string) => readFile(new URL(p, import.meta.url), 'utf8');

  const [
    supportAuth,
    impersonate,
    discounts,
    unlock,
    views,
    password,
    settings,
    proxy,
    engine,
    watchRoute,
    quizSubmit,
    homeworkSubmit,
    uploadRoute,
    panelPage,
    layout,
    courseRoute,
    learnPage,
    extendRoute,
    supportPanel,
    schema,
  ] = await Promise.all([
    read('../src/lib/support-auth.ts'),
    read('../src/lib/support-impersonate.ts'),
    read('../src/app/api/support/discounts/route.ts'),
    read('../src/app/api/support/unlock/route.ts'),
    read('../src/app/api/support/views/route.ts'),
    read('../src/app/api/support/password/route.ts'),
    read('../src/app/api/support/settings/route.ts'),
    read('../src/proxy.ts'),
    read('../src/lib/content-access-engine.ts'),
    read('../src/app/api/videos/[id]/watch/route.ts'),
    read('../src/app/api/quizzes/[id]/submit/route.ts'),
    read('../src/app/api/homework/[id]/submit/route.ts'),
    read('../src/app/api/homework/[id]/upload/route.ts'),
    read('../src/app/thefake/support/page.tsx'),
    read('../src/app/layout.tsx'),
    read('../src/app/api/courses/[id]/route.ts'),
    read('../src/app/courses/[id]/learn/page.tsx'),
    read('../src/app/api/thefake/support/extend-content/route.ts'),
    read('../src/app/thefake/support/SupportPanelClient.tsx'),
    read('../prisma/schema.prisma'),
  ]);

  // The panel password must never be a literal in the tree.
  for (const [name, source] of Object.entries({ supportAuth, panelPage })) {
    assert.doesNotMatch(source, /AlphaOmegaTerra/i, `${name} must not hardcode the support password`);
  }
  assert.match(supportAuth, /process\.env\.SUPPORT_PANEL_PASSWORD/, 'support password must come from the environment');
  assert.match(supportAuth, /timingSafeEqual/, 'support password comparison must be timing-safe');

  // Every support endpoint is gated.
  for (const [name, route] of Object.entries({ discounts, unlock, views, password, settings })) {
    assert.match(route, /getSupportSession\(\)/, `${name} route must require a support session`);
    assert.match(route, /status: 401/, `${name} route must reject an unauthenticated caller`);
  }

  // The 10% ceiling is enforced server-side, and by refusing rather than clamping.
  assert.match(discounts, /MAX_SUPPORT_DISCOUNT_PERCENT = 10/, 'support discount ceiling must be 10%');
  assert.match(discounts, /percent > MAX_SUPPORT_DISCOUNT_PERCENT/, 'the ceiling must be checked in the handler');
  assert.match(discounts, /scope: "PLATFORM_WIDE"/, 'support discounts are platform-wide');

  // Entering an account is read-only and costs the student nothing.
  assert.match(impersonate, /supportView: true/, 'impersonation token must carry the read-only claim');
  assert.match(proxy, /isSupportViewReadOnlyViolation/, 'proxy must enforce the read-only guard');
  assert.match(proxy, /SUPPORT_VIEW_READONLY/, 'blocked writes must return a recognisable code');
  assert.match(watchRoute, /usedWatchSlot: !isSupportView/, 'a support view must not consume a watch slot');
  assert.match(watchRoute, /bypassQuota/, 'a support view must not be refused by the watch quota');
  // Extra views granted after a lesson is exhausted must actually raise the
  // student's remaining count — both in the learn-page lock and in the
  // session-create response. Counting only maxWatchesPerUser made support
  // grants look successful in the panel while the student stayed locked out.
  assert.match(courseRoute, /grantedViews: grantedByVideo\.get\(video\.id\)/, 'the course payload must include support/teacher extra views');
  assert.match(learnPage, /grantedViews \?\? 0/, 'the learn page must add granted extra views to the allowance');
  assert.match(watchRoute, /allowance - used - 1/, 'a new watch session must report remaining against the granted allowance');
  assert.doesNotMatch(watchRoute, /remainingWatches: bypassQuota \? null : video\.maxWatchesPerUser - used - 1/, 'remaining watches must not ignore extra grants');
  // The upload route is excluded from the proxy matcher, so it must guard itself.
  assert.match(uploadRoute, /supportView/, 'the proxy-excluded upload route must guard itself');
  // Next.js ORs matcher entries. Skipping upload only in a second pattern is a
  // no-op if the catch-all still matches — that bug returned HTTP 400 with an
  // empty body on Android Chrome homework uploads.
  assert.match(proxy, /api\/homework\/\[\^\/\]\+\/upload/, 'the catch-all matcher must itself skip homework multipart uploads');
  assert.match(uploadRoute, /chunkIndex/, 'homework upload must accept chunked PDFs for slow mobile links');
  assert.match(uploadRoute, /uploadId/, 'chunked homework upload must bind parts to an upload id');
  assert.doesNotMatch(
    proxy,
    /\/\(api\|trpc\)\(\(\?!\/homework/,
    'do not rely on a second matcher entry to exclude homework uploads'
  );

  // Defence in depth: the routes where a leaked write would cost a grade or money.
  for (const [name, route] of Object.entries({ quizSubmit, homeworkSubmit })) {
    assert.match(route, /blockSupportView/, `${name} must refuse a support-view session directly`);
  }

  // Unlocking bypasses the prerequisite graph only, and never forges coursework.
  assert.match(engine, /hasSupportOverride/, 'the access engine must honour support overrides');
  assert.match(engine, /revokedAt: null/, 'a revoked override must stop granting access');
  assert.doesNotMatch(unlock, /homeworkSubmission\.(create|upsert)/, 'unlocking must never fabricate a homework submission');
  assert.doesNotMatch(unlock, /quizResult\.(create|upsert)/, 'unlocking must never fabricate a quiz result');

  // Changing a password must evict existing devices.
  assert.match(password, /tokenVersion: \{ increment: 1 \}/, 'a password reset must revoke existing sessions');
  assert.doesNotMatch(password, /newPassword,\s*$/m, 'the plaintext password must not be logged');

  // Everything the panel does is auditable.
  for (const [name, route] of Object.entries({ discounts, unlock, views, password, settings })) {
    assert.match(route, /logSupportAction/, `${name} route must write an audit entry`);
  }

  // The panel is unlisted, and stays reachable when the platform is gated.
  assert.match(panelPage, /robots:\s*\{[^}]*index:\s*false/, 'the support panel must not be indexed');
  assert.match(layout, /thefake\/support/, 'the support panel must bypass the maintenance gate');

  // Assessment timing is a switch, not a deletion.
  assert.match(quizSubmit, /quiz_time_limit_disabled/, 'quiz expiry must be governed by the platform flag');
  assert.match(homeworkSubmit, /homework_deadline_disabled/, 'homework expiry must be governed by the platform flag');

  assert.match(schema, /model ContentExtension/, 'timed reopen rows must be modeled');
  assert.match(schema, /@@map\("content_extensions"\)/, 'extensions table name must be content_extensions');
  assert.match(extendRoute, /export async function POST/, 'support reopen must expose POST /api/thefake/support/extend-content');
  assert.match(extendRoute, /getSupportSession\(\)/, 'extend-content must require a support session');
  assert.match(extendRoute, /contentExtension\.create/, 'extend-content must persist a content_extensions row');
  assert.match(supportPanel, /فتح بعد الإغلاق/, 'the support panel must expose the reopen action');
  assert.match(supportPanel, /\/api\/thefake\/support\/extend-content/, 'the reopen form must call the extend-content API');
  assert.match(engine, /CONTENT_CLOSED_MESSAGE/, 'closed assessments must return انتهى وقت الامتحان');
}

async function testCenterPassInvariants() {
  const { readFile } = await import('node:fs/promises');
  const read = (p: string) => readFile(new URL(p, import.meta.url), 'utf8');
  const [
    schema,
    helper,
    centerLogin,
    phoneLogin,
    proxy,
    courseRoute,
    authorization,
    centerHub,
    adminPage,
    sidebar,
  ] = await Promise.all([
    read('../prisma/schema.prisma'),
    read('../src/lib/center-pass.ts'),
    read('../src/app/api/auth/center-id/route.ts'),
    read('../src/app/api/auth/login/route.ts'),
    read('../src/proxy.ts'),
    read('../src/app/api/courses/[id]/route.ts'),
    read('../src/lib/authorization.ts'),
    read('../src/app/center/page.tsx'),
    read('../src/app/adminpanel/superadmin/page.tsx'),
    read('../src/components/admin/AdminSidebar.tsx'),
  ]);

  assert.match(schema, /model CenterPass/);
  assert.match(schema, /model CenterPassItem/);
  assert.match(schema, /CENTER_ID/);
  assert.match(helper, /CTR-/);
  assert.match(centerLogin, /centerHostLoginDenied/);
  assert.match(centerLogin, /accountMode: "CENTER_ID"/);
  assert.match(phoneLogin, /CENTER_ID_LOGIN/);
  assert.match(proxy, /CENTER_ID_HOST_ONLY/);
  assert.match(courseRoute, /filterFoldersForGrant/);
  assert.match(authorization, /centerGrant\.has\("VIDEO"/);
  assert.match(authorization, /centerGrant\.has\("HOMEWORK"/);
  assert.match(authorization, /centerGrant\.has\("QUIZ"/);
  assert.match(centerHub, /Get by ID/);
  assert.match(centerHub, /\/api\/auth\/center-id/);
  assert.match(adminPage, /CenterPassesSection/);
  assert.match(sidebar, /center-passes/);
}

async function testPendingPaymentOverviewInvariants() {
  const { readFile } = await import('node:fs/promises');
  const read = (p: string) => readFile(new URL(p, import.meta.url), 'utf8');
  const [
    overviewRoute,
    confirmRoute,
    fulfillment,
    overviewSection,
    panel,
    types,
  ] = await Promise.all([
    read('../src/app/api/admin/superadmin/overview/route.ts'),
    read('../src/app/api/admin/superadmin/pending-payments/route.ts'),
    read('../src/lib/fulfillment.ts'),
    read('../src/components/admin/superadmin/overview/OverviewSection.tsx'),
    read('../src/components/admin/superadmin/overview/PendingPaymentsPanel.tsx'),
    read('../src/components/admin/superadmin/overview/types.ts'),
  ]);

  assert.match(overviewRoute, /pendingPayments/, 'overview API must return stuck gateway invoices');
  assert.match(overviewRoute, /uniquePaidStudents/, 'overview must separate lifetime payers from live bookings');
  assert.match(overviewRoute, /activeStudents/, 'overview must count unique students inside active bookings');
  assert.match(overviewRoute, /credit_shakeout_pending/, 'pending list must include Shake-Out invoices');
  assert.match(overviewRoute, /credit_sha7nawy_pending/, 'pending list must include Sha7nawy invoices');
  assert.match(overviewRoute, /alreadyHasAccessIds/, 'stuck-invoice chase list must skip students who already have access');
  assert.match(overviewRoute, /course:\s*\{\s*isPaid:\s*true/, 'stuck-invoice list must exclude students in a paid course');
  assert.match(overviewRoute, /expiresAt:\s*\{\s*gt:\s*now/, 'stuck-invoice list must exclude students with an active booking');

  assert.match(confirmRoute, /\["superadmin", "admin"\]/, 'manual confirm is not available to staff');
  assert.match(confirmRoute, /claimPendingPaymentAsPaid/, 'confirm route must reuse the fulfillment claim helper');
  assert.match(confirmRoute, /MANUAL_CONFIRM_PENDING_PAYMENT/, 'confirming a stuck invoice must write an audit log');

  assert.match(fulfillment, /export async function claimPendingPaymentAsPaid/, 'force-paid must live in one helper');
  assert.match(fulfillment, /fulfillPendingItemPurchase/, 'force-paid must activate the same purchase as a webhook');
  assert.match(fulfillment, /updateMany/, 'force-paid must claim the pending row atomically');
  assert.match(fulfillment, /أُلغيت كمحاولة مكررة/, 'duplicate invoices for the same item must be expired, not credited again');

  assert.match(overviewSection, /PendingPaymentsPanel/, 'overview page must show the stuck-payment list');
  assert.match(overviewSection, /بدأوا الدفع ولم يكتمل/, 'headline must distinguish pending from active bookings');
  assert.match(panel, /اعتباره مدفوعاً/, 'admin must have a mark-as-paid action');
  assert.match(panel, /\/api\/admin\/superadmin\/pending-payments/, 'mark-as-paid must hit the confirm API');
  assert.match(types, /pendingPayments\?:/, 'overview types must include pending payments');

  const { describePaymentItem, paymentItemKey, parsePaymentNoteMetadata } = await importFresh<
    typeof import('../src/lib/fulfillment.ts')
  >('../src/lib/fulfillment.ts');
  const note = 'shakeout_ref:abc|base:180|itemType:teacher_sub|teacherId:t1|planType:yearly';
  assert.equal(parsePaymentNoteMetadata(note).planType, 'yearly');
  assert.equal(paymentItemKey(note), 'teacher_sub:t1:yearly');
  assert.match(describePaymentItem(note), /اشتراك معلم/);
}

async function testQuizQuestionRegradeInvariants() {
  const { readFile } = await import('node:fs/promises');
  const [route, regradeLib, submit, grading] = await Promise.all([
    readFile(new URL('../src/app/api/admin/quizzes/[id]/questions/[questionId]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/quiz-regrade.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/quizzes/[id]/submit/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/quiz-grading.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(route, /kickQuizQuestionRegrade/, 'question edit must kick a background regrade');
  assert.doesNotMatch(route, /await regradeCompletedAttempts/, 'the teacher PATCH must not wait for the class regrade');
  assert.match(route, /completedAt: \{ not: null \}/, 'regrade is only queued when completed attempts exist');
  assert.match(regradeLib, /resetEssayFeedback/, 'essay teacher notes are only wiped for the edited essay');
  assert.match(regradeLib, /teacherReply: null/, 'editing an essay clears that essay\'s manual feedback');
  assert.match(regradeLib, /quiz-grade:\$\{resultId\}/, 'regrade shares the per-result grade lock');
  assert.match(submit, /degree: parseDegree/, 'submit snapshots the question degree onto the answer');
  assert.match(grading, /earnedDegree/, 'score uses question degrees, defaulting to equal weight');

  const {
    summarizeAnswers,
    parseDegree,
  } = await importFresh<typeof import('../src/lib/quiz-grading.ts')>('../src/lib/quiz-grading.ts');
  const {
    diffQuestionEdit,
    evaluateMcqSelected,
    planAnswerRegrade,
  } = await importFresh<typeof import('../src/lib/quiz-regrade.ts')>('../src/lib/quiz-regrade.ts');

  assert.equal(parseDegree(undefined), 1);
  assert.equal(parseDegree(0), 1);
  assert.equal(parseDegree(2.4), 2);

  const equal = summarizeAnswers([
    { questionType: 'mcq', isCorrect: true, status: 'APPROVED' },
    { questionType: 'mcq', isCorrect: false, status: 'APPROVED' },
  ]);
  assert.equal(equal.score, 50);
  assert.equal(equal.correct, 1);

  const weighted = summarizeAnswers([
    { questionType: 'mcq', isCorrect: true, status: 'APPROVED', degree: 3 },
    { questionType: 'mcq', isCorrect: false, status: 'APPROVED', degree: 1 },
  ]);
  assert.equal(weighted.score, 75);

  const mcq = { question: 'q', questionType: 'mcq', optionA: 'a', optionB: 'b', optionC: '', optionD: '', correctAnswer: 'A', degree: 1 };
  const mcqKey = diffQuestionEdit(mcq, { ...mcq, correctAnswer: 'B' });
  assert.equal(mcqKey.needsRegrade, true);
  assert.equal(mcqKey.resetEssayFeedback, false);

  const essay = { question: 'explain', questionType: 'essay', optionA: '', optionB: '', optionC: '', optionD: '', correctAnswer: 'A', degree: 1 };
  const essayText = diffQuestionEdit(essay, { ...essay, question: 'explain in detail' });
  assert.equal(essayText.resetEssayFeedback, true);
  const essayDegreeOnly = diffQuestionEdit(essay, { ...essay, degree: 5 });
  assert.equal(essayDegreeOnly.needsRegrade, true);
  assert.equal(essayDegreeOnly.resetEssayFeedback, false);

  assert.equal(evaluateMcqSelected('A', 'B'), false);
  assert.equal(evaluateMcqSelected('B', 'B'), true);
  assert.equal(evaluateMcqSelected(null, 'A'), false);

  const keptEssay = planAnswerRegrade({
    questionType: 'essay',
    selectedAnswer: null,
    correctAnswer: 'A',
    existing: {
      isCorrect: true,
      status: 'APPROVED',
      teacherReply: 'جيد',
      reviewedAt: new Date('2026-01-01'),
    },
    resetEssayFeedback: false,
  });
  assert.equal(keptEssay.status, 'APPROVED');
  assert.equal(keptEssay.isCorrect, true);
  assert.equal(keptEssay.teacherReply, 'جيد');
  assert.equal(keptEssay.wipeAiGrade, false);

  const wipedEssay = planAnswerRegrade({
    questionType: 'essay',
    selectedAnswer: null,
    correctAnswer: 'A',
    existing: {
      isCorrect: true,
      status: 'APPROVED',
      teacherReply: 'جيد',
      reviewedAt: new Date('2026-01-01'),
    },
    resetEssayFeedback: true,
  });
  assert.equal(wipedEssay.status, 'PENDING');
  assert.equal(wipedEssay.isCorrect, false);
  assert.equal(wipedEssay.teacherReply, null);
  assert.equal(wipedEssay.wipeAiGrade, true);

  const convertedToMcq = planAnswerRegrade({
    questionType: 'mcq',
    selectedAnswer: 'B',
    correctAnswer: 'B',
    existing: {
      isCorrect: true,
      status: 'APPROVED',
      teacherReply: 'قديم',
      reviewedAt: new Date('2026-01-01'),
    },
    resetEssayFeedback: true,
  });
  assert.equal(convertedToMcq.status, 'APPROVED');
  assert.equal(convertedToMcq.isCorrect, true);
  assert.equal(convertedToMcq.teacherReply, null);
}

async function testHomeworkQuestionRegradeInvariants() {
  const { readFile } = await import('node:fs/promises');
  const [route, regradeLib, submit, review] = await Promise.all([
    readFile(new URL('../src/app/api/admin/homework/[id]/questions/[questionId]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/homework-regrade.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/homework/[id]/submit/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/homework/[id]/review/route.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(route, /kickHomeworkQuestionRegrade/, 'homework question edit must kick a background regrade');
  assert.doesNotMatch(route, /await regradeCompletedHomeworkAttempts/, 'the teacher PATCH must not wait for the class regrade');
  assert.match(route, /answers: \{ not: null \}/, 'regrade is only queued when completed exam submissions exist');
  assert.match(regradeLib, /HomeworkReview/, 'teacher review notes must stay when a question is regraded');
  assert.doesNotMatch(regradeLib, /homeworkReview\.(delete|update|upsert)/, 'regrade must not rewrite teacher review rows');
  assert.match(regradeLib, /homework-grade:\$\{submissionId\}/, 'regrade shares a per-submission grade lock');
  assert.match(submit, /scoreHomeworkExam/, 'submit must use the same homework scoring helper as regrade');
  assert.match(review, /note: body.note/, 'manual teacher notes still live on HomeworkReview');

  const {
    parseHomeworkAnswers,
    scoreHomeworkExam,
  } = await importFresh<typeof import('../src/lib/homework-regrade.ts')>('../src/lib/homework-regrade.ts');

  const q1 = { id: 'q1', correctAnswer: 'A', degree: 1 };
  const q2 = { id: 'q2', correctAnswer: 'B', degree: 1 };
  const answers = parseHomeworkAnswers(JSON.stringify({ q1: 'A', q2: 'A' }));
  assert.equal(answers.q1, 'A');
  const before = scoreHomeworkExam([q1, q2], answers);
  assert.equal(before.score, 50);
  assert.equal(before.status, 'passed');

  const afterKeyChange = scoreHomeworkExam([q1, { ...q2, correctAnswer: 'A' }], answers);
  assert.equal(afterKeyChange.score, 100);
  assert.equal(afterKeyChange.status, 'passed');

  const weighted = scoreHomeworkExam(
    [
      { id: 'q1', correctAnswer: 'A', degree: 3 },
      { id: 'q2', correctAnswer: 'B', degree: 1 },
    ],
    answers
  );
  assert.equal(weighted.score, 75);
}

const TESTS: Array<[string, () => Promise<void>]> = [
  ['phoneNormalization', testPhoneNormalization],
  ['devMockSms', testDevMockSms],
  ['verifySmsRequestShape', testVerifySmsRequestShape],
  ['zadxOtpRequestShape', testZadxOtpRequestShape],
  ['whatsAppPayloadShape', testWhatsAppPayloadShape],
  ['whatsAppOfflineSkipsToSms', testWhatsAppOfflineSkipsToSms],
  ['whatsAppFallbackToSms', testWhatsAppFallbackToSms],
  ['verifiedPaymentAmountBinding', testVerifiedPaymentAmountBinding],
  ['currencyAmountValidation', testCurrencyAmountValidation],
  ['securityPatchInvariants', testSecurityPatchInvariants],
  ['aiVideoAssessmentInvariants', testAiVideoAssessmentInvariants],
  ['quizRetakeInvariants', testQuizRetakeInvariants],
  ['contentDependencyGraphInvariants', testContentDependencyGraphInvariants],
  ['curriculumPracticeInvariants', testCurriculumPracticeInvariants],
  ['teacherTrialVideoToggleInvariants', testTeacherTrialVideoToggleInvariants],
  ['supportPanelInvariants', testSupportPanelInvariants],
  ['centerPassInvariants', testCenterPassInvariants],
  ['pendingPaymentOverviewInvariants', testPendingPaymentOverviewInvariants],
  ['quizQuestionRegradeInvariants', testQuizQuestionRegradeInvariants],
  ['homeworkQuestionRegradeInvariants', testHomeworkQuestionRegradeInvariants],
];

/**
 * Runs every test by default. Pass `--only=<substring>` to run a subset —
 * without it, one failing invariant hides every test declared after it, so a
 * red suite makes the rest unverifiable rather than merely unproven.
 * Example: npm run test:verification -- --only=supportPanel
 */
async function main() {
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const filter = onlyArg ? onlyArg.slice('--only='.length).toLowerCase() : '';
  const selected = filter
    ? TESTS.filter(([name]) => name.toLowerCase().includes(filter))
    : TESTS;

  if (selected.length === 0) {
    console.error(`no test matches --only=${filter}`);
    console.error(`available: ${TESTS.map(([n]) => n).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const failures: string[] = [];
  for (const [name, fn] of selected) {
    try {
      await fn();
      console.log(`PASS ${name}`);
    } catch (error) {
      failures.push(name);
      console.error(`FAIL ${name}`);
      console.error(error);
    }
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} of ${selected.length} failed: ${failures.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nverification tests passed (${selected.length})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
