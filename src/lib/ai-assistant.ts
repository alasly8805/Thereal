import { StudentContext } from "./ai-context";
import type { ResolvedProvider } from "./ai-provider";

// XKiro (DeepSeek v4 Flash) — Primary #1 Model
const XKIRO_API_KEY = process.env.XKIRO_API_KEY || "";
const XKIRO_BASE_URL = (process.env.XKIRO_BASE_URL || "https://api.xkiro.com/v1").replace(/\/+$/, "");
const XKIRO_MODEL = process.env.XKIRO_MODEL || "deepseek/deepseek-v4-flash";

// Groq — secondary fallback
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const GROQ_MODEL = process.env.GROQ_MODEL || "allam-2-7b";

// DeepSeek official fallback
const PRIMARY_API_KEY = process.env.AI_PRIMARY_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || "";
const PRIMARY_API_URL = process.env.AI_PRIMARY_BASE_URL || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1";
const PRIMARY_MODEL = process.env.AI_PRIMARY_MODEL || process.env.DEEPSEEK_MODEL || "deepseek-chat";

// Gemini fallback (with multiple key rotation)
const GEMINI_KEYS = [
  process.env.GEMINI_KEY_1 || process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY || "",
  process.env.GEMINI_KEY_2 || process.env.GEMINI_API_KEY_2 || process.env.GEMINI_API_KEY_SECONDARY || "",
  process.env.GEMINI_KEY_3 || process.env.GEMINI_API_KEY_3 || "",
].filter(Boolean);
const BACKUP_BASE_RAW = process.env.AI_BACKUP_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";
const BACKUP_BASE_URL = BACKUP_BASE_RAW.replace(/\/+$/, "");
const BACKUP_MODEL = process.env.AI_BACKUP_MODEL || "gemini-flash-lite-latest";
const PROVIDER_TIMEOUT_MS = 12_000;

function providerSignal(requestSignal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
  if (!requestSignal) return timeout;
  return typeof AbortSignal.any === "function" ? AbortSignal.any([requestSignal, timeout]) : requestSignal;
}

export function stripFallbackMarkers(content: string): string {
  return content.replace(/\[م:[^\]]+\]/g, "").trim();
}

function cleanArabicUTF8(str: string): string {
  return str
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thought>[\s\S]*?<\/thought>/gi, "")
    .replace(/[\u0400-\u04FF]/g, "") // Strip any Cyrillic/Russian token bleed
    .replace(/[\u25A0-\u25FF\uFFFD\uFFFE\uFFFF]/g, "") // Strip replacement symbols
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function parseAIResponse(raw: string, source: "primary" | "backup" | "fallback"): AIChatResult {
  const clean = cleanArabicUTF8(raw);
  const jsonMatch = clean.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed && typeof parsed === "object") {
        const messageStr = typeof parsed.message === "string" ? parsed.message : typeof parsed.text === "string" ? parsed.text : "";
        if (messageStr) {
          return {
            message: cleanArabicUTF8(stripFallbackMarkers(messageStr)),
            actions: Array.isArray(parsed.actions) ? parsed.actions : [],
            source,
          };
        }
      }
    } catch {
      // Fallback to plain text
    }
  }

  return {
    message: cleanArabicUTF8(stripFallbackMarkers(clean)),
    actions: [],
    source,
  };
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface InteractiveQuestionOption {
  id: string;
  text: string;
}

export interface InteractiveQuestionPayload {
  questionId: string;
  topic: string;
  question: string;
  options: InteractiveQuestionOption[];
  correctAnswer: string;
  explanation: string;
  hint?: string;
  difficulty?: "easy" | "medium" | "hard";
}

export interface AIAction {
  type:
    | "create_grade_request"
    | "create_ticket"
    | "submit_feedback"
    | "navigate"
    | "show_insights"
    | "interactive_question"
    | "update_course"
    | "none";
  payload?: Record<string, unknown> | InteractiveQuestionPayload;
}

export interface AIChatResult {
  message: string;
  actions: AIAction[];
  source: "primary" | "backup" | "fallback";
}

const SYSTEM_PROMPT = `أنت "مرشد Code-UP"، الموجه الذكي والمعلم المساند للمتعلم على منصة Code-UP.

شخصيتك وأسلوبك:
- أسلوبك سريع، ودود، ومباشر باللغة العربية، وتتحدث مباشرة في صلب الموضوع بإيجاز ونقاط واضحة دون مماطلة أو وعود زائفة.
- **إدارة وتعديل الكورسات للمشرف العام (Superadmin Course Management):**
  إذا كان المستخدم مشرفاً عاماً (Superadmin) وطلب تعديل كورس في رسالته (مثل: "كورس الشهر الاول عربي خليه مجاني"، "كورس كذا خليه 50 جنيه"، "كورس كذا خليه تأسيسي"، "كورس كذا خليه حصة"، "كورس كذا خليه شهر"):
  - ابحث عن الكورس المطابق من قائمة الكورسات المرفقة في سياق المشرف العام أدناه بدقة.
  - قم بتضمين action من نوع "update_course" بالبيانات المراد تعديلها:
    {
      "type": "update_course",
      "payload": {
        "courseId": "معرف الكورس من القائمة",
        "category": "foundation" | "month" | "lesson" | "general" | "auto",
        "isPaid": true | false,
        "price": 50
      }
    }
  - أجب في message بتأكيد التعديل واسم الكورس وما تم تغييره بوضوح تام ودون تردد.
- **شرح المفاهيم وتدريب الطالب (Educational Tutoring & Concept Explanations):**
  - إذا سأل الطالب عن مفهوم علمي، أو طلب شرحاً، أو ضغط "اسأل المساعد عن المفهوم"، أو جاءت الرسالة بصيغة: *"اشرح لي بالتفصيل مفهوم ... ولا تعطني الإجابة مباشرة؛ ساعدني في فهم الفكرة"*:
  - **اشرح المفهوم العلمي خطوة بخطوة باللغة العربية مع تبسيط كامل وتلميحات ذكية في نص message**.
  - **ممنوع منعاً باتاً إنشاء سؤال اختباري جديد أو وضع action من نوع interactive_question في هذه الحالة**.
  - إذا طلب الطالب عدم إعطاء الإجابة المباشرة، اتبع الأسلوب السقراطي: اشرح التسلسل المنطقي والفكرة الجوهرية وقدم تلميحاً ذكياً يساعده على استنتاج الخيار الصحيح بنفسه.
- **توليد الأسئلة والاختبارات التفاعلية (Interactive Question Generation):** فقط وحصرياً إذا طلب الطالب صراحة أن تختبره أو تسأله (مثل "اسألني سؤال"، "اختبرني"، "كويز على الدرس"، "اديني سؤال جديد")، **ممنوع كتابة الخيارات كنص مجرد في message**. يجب حتماً تضمين action من نوع "interactive_question" يحتوي على:
  - topic: عنوان الموضوع والدرس
  - question: نص السؤال
  - options: مصفوفة الخيارات (A, B, C, D أو أ، ب، ج، د)
  - correctAnswer: رمز الإجابة الصحيحة
  - explanation: التفسير والشرح النموذجي الدقيق.
- **التوجيه والانتقال الفوري (Navigation):** إذا طلب الطالب الانتقال لصفحة (كورس، فيديو، بيئة تدريب، أو أسئلة المنهج) أو وافق على الانتقال (مثل "انقلني"، "ماشي"، "يلا"، "وديني"، "افتح الكورس")، **يجب حتماً** تضمين action من نوع "navigate" مع مسار الـ path المناسب (مثل: { "type": "navigate", "payload": { "path": "/courses/COURSE_ID", "reason": "الانتقال لصفحة الكورس" } } أو { "type": "navigate", "payload": { "path": "/environments/programming?tab=curriculum", "reason": "الانتقال لأسئلة المنهج" } } أو { "type": "navigate", "payload": { "path": "/curriculum/programming-and-ai", "reason": "دليل المنهج" } }).
- **المنهج الدراسي الرسمي (البرمجة والذكاء الاصطناعي - 2 ثانوي / بكالوريا مصرية):**
  إذا سأل الطالب عن "المنهج"، "منهج الوزارة"، "محتوى أول درس"، "دروس المنهج"، "تانية ثانوي":
  - اشرح له محتوى درس المنهج الوزاري الفعلي بدقة:
    * الدرس الأول (1-1): «تطور تكنولوجيا المعلومات والتحول الاجتماعي» (المراحل الزمنية الأربعة: بداية ظهور الحاسب ➔ تسويق الإنترنت تجارياً ➔ ظهور الهواتف الذكية ➔ انتشار الحوسبة السحابية، قانون مور وتضاعف الترانزستورات، الحوسبة الطرفية في السيارات ذاتية القيادة، الواقع المعزز AR والافتراضي VR، الحوسبة الكمومية، والشمول المالي والدفع غير النقدي).
    * الدرس الثاني (1-2): «كيف يعمل الذكاء الاصطناعي» (هرمية AI > ML > DL > GenAI، الشبكات العصبية، ومخاطر الهلوسة).
    * الفصل 2: «الأمن السيبراني» (HTTPS ومصافحة TLS، 2FA، DMZ، Zero Trust، الدفاع في العمق، والاستجابة للحوادث).
    * الفصل 3: «تطبيقات الويب» (الطبقات الثلاث، HTTP/HTTPS، GET/POST، الرموز 200/404/500، HTML الدلالية والتصميم المتجاوب).
    * الفصل 4: «تصميم الوسائط» (الوسائط، Persona، Wireframe، مبادئ CRAP، التقييم النوعي/الكمي، ودورة PDCA).
    * الفصل 5: «جمع وتنقية البيانات» (البيانات الأولية/الثانوية، العينات، القيم المفقودة، Min-Max، التوحيد القياسي، والبيانات المفتوحة).
    * الفصل 6: «التحليل والتواصل» (الاستدلال الإحصائي، اختبار الفرضيات، p-value، أخطاء النوعين، الانحدار الخطي، والخرائط الحرارية).
    * الفصل 7: «التعلم الآلي والذكاء الاصطناعي» (الأنماط الثلاثة، التصنيف والتجميع، الشبكات العصبية والتعلم العميق، LLM، و RLHF).
  - لا تخلط بين كورس تدريبي مسجل للطالب وبين المنهج الوزاري الشامل، وأجب عن سؤال المنهج فوراً بوضوح ودقة.

قواعد الرد:
- الرد يجب أن يكون JSON بالشكل التالي حصراً وسريعاً:
{
  "message": "ردك الودود المباشر والموجز باللغة العربية",
  "actions": [
    {
      "type": "create_grade_request" | "create_ticket" | "submit_feedback" | "navigate" | "show_insights" | "interactive_question" | "update_course" | "none",
      "payload": { ... }
    }
  ]
}

أنواع الـ payload:
- update_course: { "courseId": "c_id", "category": "foundation" | "month" | "lesson" | "general" | "auto", "isPaid": boolean, "price": number }
- interactive_question: { "questionId": "q_1", "topic": "تطور تكنولوجيا المعلومات", "question": "نص السؤال؟", "options": [{"id":"A","text":"خيار أ"},{"id":"B","text":"خيار ب"},{"id":"C","text":"خيار ج"},{"id":"D","text":"خيار د"}], "correctAnswer": "A", "explanation": "تفسير سبب صحة الخيار أ ولماذا الخيارات الأخرى خاطئة" }
- navigate: { "path": "/courses/..." | "/environments/programming?tab=curriculum" | "/curriculum/programming-and-ai", "reason": "نص زر الانتقال" }
- create_grade_request: { quizId, reason, requestedScore, evidence }
- create_ticket: { title, description, type, priority }
- submit_feedback: { courseId, type, content, rating? }
- show_insights: {}`;

function summarizeContext(ctx: StudentContext): string {
  const isSuper = ctx.profile?.role === "superadmin" || ctx.profile?.role === "admin";
  if (isSuper) {
    const courseLines = (ctx.courses || [])
      .map(
        (c) =>
          `- [ID: ${c.id}] "${c.title}" | مدرس: ${c.teacher} | تصنيف: ${c.category || "auto"} | نوع: ${c.isPaid ? `مدفوع (${c.price} ج.م)` : "مجاني"}`
      )
      .join("\n");

    return `بيانات المشرف العام (Superadmin Master Context):
- الاسم: ${ctx.profile?.name || "المشرف العام"}
- الصلاحية: ${ctx.profile?.role || "superadmin"} (تحكم كامل في كورسات وإعدادات المنصة)

قائمة كورسات المنصة المتاحة للتحكم والتعديل:
${courseLines || "لا يوجد كورسات"}
`;
  }

  const courseLines = (ctx.courses || [])
    .map((c) => {
      const quizSummary = (c.quizResults || [])
        .filter((q) => q.date)
        .map((q) => `${q.quizTitle}: ${Math.round(q.percentage)}%`)
        .join(", ");
      return `- ${c.title} (${c.subject}, مدرس: ${c.teacher}): تقدم ${c.progress.percentage}% (${c.progress.videosWatched}/${c.progress.totalVideos} فيديو)${quizSummary ? `, كويزات: ${quizSummary}` : ""}`;
    })
    .join("\n");

  const weakAreasText = (ctx.weakAreas?.length || 0) > 0
    ? ctx.weakAreas!.map((w) => `- ${w.subject}: ${w.topic} (${w.reason})`).join("\n")
    : "لا يوجد نقاط ضعف واضحة";

  const insightsText = (ctx.aiInsights?.length || 0) > 0
    ? ctx.aiInsights!.map((i) => `- [${i.type}] ${i.title}: ${i.description}`).join("\n")
    : "لا يوجد رؤى سابقة";

  const feedbackText = (ctx.recentFeedback?.length || 0) > 0
    ? ctx.recentFeedback!.map((f) => `- [${f.type}] في ${f.course}: ${f.content}`).join("\n")
    : "لم يقدم ملاحظات سابقة";

  return `بيانات المتعلم الكاملة:

الملف الشخصي:
- الاسم: ${ctx.profile?.name || "طالب"}
- المرحلة: ${ctx.profile?.educationalStage ?? "غير محددة"}

الإحصائيات:
- عدد الكورسات: ${ctx.overallStats?.totalCourses ?? 0}
- متوسط الدرجات: ${ctx.overallStats?.averageScore ?? 0}%
- كويزات: ${ctx.overallStats?.totalQuizzesTaken ?? 0}
- فيديوهات: ${ctx.overallStats?.totalVideosWatched ?? 0}

الكورسات:
${courseLines || "لم يسجل بعد"}

نقاط الضعف:
${weakAreasText}`;
}

async function callXKiro(messages: ChatMessage[], requestSignal?: AbortSignal): Promise<AIChatResult | null> {
  if (!XKIRO_API_KEY) return null;
  try {
    const sys = messages.find((m) => m.role === "system")?.content || "";
    const userMsgs = messages.filter((m) => m.role !== "system");
    const res = await fetch(`${XKIRO_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${XKIRO_API_KEY}`,
      },
      body: JSON.stringify({
        model: XKIRO_MODEL,
        messages: [
          { role: "system", content: sys },
          ...userMsgs.map((m) => ({ role: m.role, content: m.content })),
        ],
        max_tokens: 1200,
        temperature: 0.5,
      }),
      signal: providerSignal(requestSignal),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.warn(`[XKiro AI] Call failed (${res.status}):`, (errData as any)?.error?.message || res.statusText);
      return null;
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content || "";
    if (!raw) return null;
    return parseAIResponse(raw, "primary");
  } catch (err) {
    if (requestSignal?.aborted) throw err;
    console.warn("[AI Provider XKiro] Error:", err);
    return null;
  }
}

async function callGroq(messages: ChatMessage[], requestSignal?: AbortSignal): Promise<AIChatResult | null> {
  if (!GROQ_API_KEY) return null;
  const sys = messages.find((m) => m.role === "system")?.content || "";
  const userMsgs = messages.filter((m) => m.role !== "system");
  const models = Array.from(new Set([GROQ_MODEL, "allam-2-7b", "qwen/qwen3.6-27b"]));

  for (const model of models) {
    try {
      const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: sys },
            ...userMsgs.map((m) => ({ role: m.role, content: m.content })),
          ],
          max_tokens: 600,
          temperature: 0.3,
        }),
        signal: providerSignal(requestSignal),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.warn(`[AI Provider Groq (${model})] Error: ${res.status}`, (errData as any)?.error?.message?.slice(0, 80));
        continue;
      }
      const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
      const raw = data.choices[0]?.message?.content || "";
      if (!raw) continue;
      return parseAIResponse(raw, "primary");
    } catch (err) {
      if (requestSignal?.aborted) throw err;
      console.warn(`[AI Provider Groq (${model})] Error:`, err);
    }
  }
  return null;
}

async function callPrimary(messages: ChatMessage[], requestSignal?: AbortSignal): Promise<AIChatResult | null> {
  if (!PRIMARY_API_KEY) return null;
  try {
    const sys = messages.find((m) => m.role === "system")?.content || "";
    const userMsgs = messages.filter((m) => m.role !== "system");
    const baseUrl = PRIMARY_API_URL.replace(/\/chat\/completions$/, "").replace(/\/messages$/, "");
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${PRIMARY_API_KEY}`,
      },
      body: JSON.stringify({
        model: PRIMARY_MODEL,
        messages: [
          { role: "system", content: sys },
          ...userMsgs.map((m) => ({ role: m.role, content: m.content })),
        ],
        max_tokens: 600,
        temperature: 0.5,
      }),
      signal: providerSignal(requestSignal),
    });
    if (!res.ok) throw new Error(`Primary API: ${res.status}`);
    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    const raw = data.choices[0]?.message?.content || "";
    if (!raw) return null;
    return parseAIResponse(raw, "primary");
  } catch (err) {
    console.warn("[AI Provider Primary] Error:", err);
    return null;
  }
}

async function callBackup(messages: ChatMessage[], requestSignal?: AbortSignal): Promise<AIChatResult | null> {
  const validKeys = GEMINI_KEYS.filter((k) => k && (k.startsWith("AIzaSy") || k.length > 20));
  if (validKeys.length === 0) return null;
  const sys = messages.find((m) => m.role === "system")?.content || "";
  const userMsgs = messages.filter((m) => m.role !== "system");
  const promptText = sys
    ? `[النظام: ${sys}]\n\n` + userMsgs.map((m) => `${m.role === "user" ? "المتعلم" : "المرشد"}: ${m.content}`).join("\n")
    : userMsgs.map((m) => `${m.role === "user" ? "المتعلم" : "المرشد"}: ${m.content}`).join("\n");

  const geminiBase = BACKUP_BASE_URL.endsWith("/models") ? BACKUP_BASE_URL : `${BACKUP_BASE_URL}/models`;
  const models = [BACKUP_MODEL, "gemini-2.0-flash-lite"];

  for (const key of validKeys) {
    for (const model of models) {
      try {
        const url = `${geminiBase}/${model}:generateContent?key=${key}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: { maxOutputTokens: 600, temperature: 0.6 },
          }),
          signal: providerSignal(requestSignal),
        });
        if (!res.ok) {
          console.warn(`[AI Provider Gemini (${model})] Error: ${res.status}`);
          break; // Key failed on this endpoint, immediately move to next
        }
        const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (!raw) continue;
        return parseAIResponse(raw, "backup");
      } catch (err) {
        if (requestSignal?.aborted) throw err;
        console.warn("[AI Provider Gemini] Error:", err);
        break; // Stop retrying on error/timeout
      }
    }
  }
  return null;
}

/**
 * Fast-path hedging: Executes primary caller first.
 * If not resolved in `hedgeDelayMs` (default 1800ms), triggers secondary in parallel
 * and accepts the first successful response.
 */
async function raceWithHedge(
  primaryPromise: Promise<AIChatResult | null>,
  secondaryFn: () => Promise<AIChatResult | null>,
  hedgeDelayMs = 1800
): Promise<AIChatResult | null> {
  let finished = false;

  return new Promise((resolve) => {
    // 1. Primary execution
    primaryPromise.then((res) => {
      if (res?.message && !finished) {
        finished = true;
        resolve(res);
      }
    }).catch(() => {});

    // 2. Delayed secondary launch if primary is taking too long
    const timer = setTimeout(() => {
      if (!finished) {
        secondaryFn().then((res) => {
          if (res?.message && !finished) {
            finished = true;
            resolve(res);
          }
        }).catch(() => {});
      }
    }, hedgeDelayMs);

    // 3. Fallback resolution if both complete or fail
    Promise.allSettled([
      primaryPromise,
      new Promise((r) => setTimeout(r, hedgeDelayMs + 3500)),
    ]).then(() => {
      clearTimeout(timer);
      setTimeout(() => {
        if (!finished) {
          finished = true;
          resolve(null);
        }
      }, 100);
    });
  });
}

// ── Menu state detection ──
function getMenuState(history: ChatMessage[]): { state: string; data: string } {
  const lastAssistant = [...history].reverse().find((m) => m.role === "assistant");
  if (!lastAssistant) return { state: "menu", data: "" };
  const match = lastAssistant.content.match(/\[م:([^:\]]+)(?::([^\]]*))?\]/);
  return match ? { state: match[1], data: match[2] || "" } : { state: "menu", data: "" };
}

function buildMainMenu(ctx: StudentContext, notifications?: string): string {
  let menu = "";
  if (notifications) {
    menu += `🔔 ${notifications}\n\n━━━━━━━━━━━━━━━━\n\n`;
  }
  menu += `اختار رقم:\n\n`;
  menu += `1️⃣  تحليل أدائي ودرجاتي\n`;
  menu += `2️⃣  خطة تدريبية\n`;
  menu += `3️⃣  طلب تعديل درجة ✏️\n`;
  menu += `4️⃣  تقديم شكوى 📢\n`;
  menu += `5️⃣  حالة طلباتي 📋\n\n`;
  menu += `📊 ${ctx.overallStats.totalCourses} كورس | متوسط ${ctx.overallStats.averageScore}%\n\n[م:menu]`;
  return menu;
}

function buildPerformanceAnalysis(ctx: StudentContext): string {
  const allQuizResults = ctx.courses.flatMap((c) => c.quizResults.filter((q) => q.date));
  const lowQuizzes = ctx.courses
    .flatMap((c) => c.quizResults.filter((q) => q.date && q.percentage < 60).map((q) => `• ${c.title} - ${q.quizTitle} (${Math.round(q.percentage)}%)`));
  const highQuizzes = ctx.courses
    .flatMap((c) => c.quizResults.filter((q) => q.date && q.percentage >= 80).map((q) => `• ${c.title} - ${q.quizTitle} (${Math.round(q.percentage)}%)`));

  let a = `📊 تحليل أدائك:\n\nمتوسط الدرجات: ${ctx.overallStats.averageScore}%\nكويزات محلولة: ${allQuizResults.length}\nفيديوهات متشافة: ${ctx.overallStats.totalVideosWatched}\n`;
  if (highQuizzes.length > 0) a += `\n💪 نقاط قوتك:\n${highQuizzes.slice(0, 3).join("\n")}\n`;
  if (lowQuizzes.length > 0) a += `\n⚠️ محتاج تراجع:\n${lowQuizzes.slice(0, 3).join("\n")}\n`;
  if (ctx.weakAreas.length > 0) a += `\n📌 نقاط ضعف:\n${ctx.weakAreas.slice(0, 3).map((w) => `• ${w.subject}: ${w.topic}`).join("\n")}\n`;
  if (lowQuizzes.length === 0 && ctx.weakAreas.length === 0) a += `\n✅ أداء ممتاز! مفيش نقاط ضعف.\n`;
  a += `\nاكتب 0 للرجوع\n\n[م:1]`;
  return a;
}

function buildStudyPlan(ctx: StudentContext): string {
  const weakSubjects = ctx.weakAreas.map((w) => w.subject).filter((v, i, a) => a.indexOf(v) === i);
  const coursesInfo = ctx.courses.map((c) => ({
    title: c.title, unwatched: c.progress.totalVideos - c.progress.videosWatched,
    lowQuizzes: c.quizResults.filter((q) => q.date && q.percentage < 60).length, progress: c.progress.percentage,
  }));
  const priority = coursesInfo.filter((c) => c.unwatched > 0 || c.lowQuizzes > 0);
  let plan = `📋 خطتك النهاردة:\n\n`;
  if (priority.length > 0) {
    plan += priority.slice(0, 3).map((c) => {
      const tasks: string[] = [];
      if (c.unwatched > 0) tasks.push(`شوف ${Math.min(c.unwatched, 2)} فيديو`);
      if (c.lowQuizzes > 0) tasks.push(`راجع الكويزات الضعيفة`);
      return `📚 ${c.title} (${c.progress}%):\n   ${tasks.join(" + ")}`;
    }).join("\n\n");
    if (weakSubjects.length > 0) plan += `\n\n⚠️ ركّز على: ${weakSubjects.join("، ")}`;
  } else {
    plan += `ممتاز! 🎉 خالص كل حاجة. راجع الكويزات اللي أقل من 80%.`;
  }
  plan += `\n\nاكتب 0 للرجوع\n\n[م:2]`;
  return plan;
}

function buildQuizList(ctx: StudentContext): { list: string; hasQuizzes: boolean } {
  const quizzes = ctx.courses.flatMap((c) =>
    c.quizResults.filter((q) => q.date).map((q) => ({
      code: q.quizId.slice(-8).toUpperCase(), title: q.quizTitle, course: c.title, score: Math.round(q.percentage),
    }))
  );
  if (quizzes.length === 0) return { list: "", hasQuizzes: false };
  return {
    list: quizzes.map((q) => `  ${q.code} → ${q.title} (${q.course}) - ${q.score}%`).join("\n"),
    hasQuizzes: true,
  };
}

function buildChatContextForStaff(history: ChatMessage[], ctx: StudentContext): { chatHistory: string; studentInfo: string } {
  const chatHistory = history.slice(-8).map((m) =>
    `${m.role === "user" ? "المتعلم" : "المرشد"}: ${m.content.replace(/\[م:[^\]]+\]/g, "").trim()}`
  ).join("\n");
  const studentInfo = [
    `الاسم: ${ctx.profile.name}`,
    `المرحلة: ${ctx.profile.educationalStage || "غير محدد"}`,
    `العمر: ${ctx.profile.age ?? "غير محدد"}`,
    `متوسط الدرجات: ${ctx.overallStats.averageScore}%`,
    `الكورسات: ${ctx.overallStats.totalCourses}`,
    `كويزات محلولة: ${ctx.overallStats.totalQuizzesTaken}`,
    `فيديوهات متشافة: ${ctx.overallStats.totalVideosWatched}`,
    ctx.weakAreas.length > 0 ? `نقاط ضعف: ${ctx.weakAreas.map((w) => `${w.subject}: ${w.topic}`).join("، ")}` : "",
  ].filter(Boolean).join("\n");
  return { chatHistory, studentInfo };
}

export const CURRICULUM_QUESTION_BANK: InteractiveQuestionPayload[] = [
  // ── الدرس 1-1: تطور تكنولوجيا المعلومات ──
  {
    questionId: "q_it_timeline",
    topic: "الدرس 1-1: مراحل تطور تكنولوجيا المعلومات",
    question: "ما الترتيب الزمني الصحيح لمراحل تطور تكنولوجيا المعلومات (IT)؟",
    options: [
      { id: "A", text: "بداية ظهور الحاسب ➔ تسويق الإنترنت تجارياً ➔ ظهور الهواتف الذكية ➔ انتشار الحوسبة السحابية" },
      { id: "B", text: "بداية ظهور الحاسب ➔ ظهور الهواتف الذكية ➔ تسويق الإنترنت تجارياً ➔ انتشار الحوسبة السحابية" },
      { id: "C", text: "ظهور الهواتف الذكية ➔ تسويق الإنترنت تجارياً ➔ ظهور الحاسب ➔ انتشار الحوسبة السحابية" },
      { id: "D", text: "تسويق الإنترنت تجارياً ➔ بداية ظهور الحاسب ➔ انتشار الحوسبة السحابية ➔ ظهور الهواتف الذكية" },
    ],
    correctAnswer: "A",
    explanation: "الترتيب التاريخي الدقيق لتطور تكنولوجيا المعلومات (IT) وفقاً للمنهج: 1. بداية ظهور الحواسيب (1940s-1970s)، 2. تسويق الإنترنت تجارياً في التسعينيات (1990s)، 3. ثورة الهواتف الذكية (2000s)، 4. انتشار الحوسبة السحابية والخدمات الرقمية.",
    difficulty: "medium",
  },
  {
    questionId: "q_it_1",
    topic: "الدرس 1-1: تطور تكنولوجيا المعلومات",
    question: "ما هو المكون الإلكتروني الرئيسي الذي ميّز الجيل الأول من الحواسيب مثل حاسوب (ENIAC) في أربعينيات القرن الماضي؟",
    options: [
      { id: "A", text: "الصمامات المفرغة (Vacuum Tubes)" },
      { id: "B", text: "الترانزستورات (Transistors)" },
      { id: "C", text: "الدوائر المتكاملة (Integrated Circuits)" },
      { id: "D", text: "المعالجات الدقيقة (Microprocessors)" },
    ],
    correctAnswer: "A",
    explanation: "اعتمد الجيل الأول (مثل حاسوب ENIAC) على الصمامات المفرغة الزجاجية للتحكم في تدفق الإلكترونات، وكانت ضخمة وتولد حرارة هائلة وتستهلك طاقة كبيرة، قبل أن يبتكر العلماء الترانزستور في الجيل الثاني لتصغير الحجم وزيادة السرعة.",
    difficulty: "easy",
  },
  {
    questionId: "q_it_2",
    topic: "الدرس 1-1: تطور تكنولوجيا المعلومات",
    question: "ينص «قانون مور» (Moore's Law) الشهير الذي صاغه جوردون مور على أن:",
    options: [
      { id: "A", text: "حجم ذاكرة الوصول العشوائي يتضاعف كل 6 أشهر" },
      { id: "B", text: "عدد الترانزستورات على شريحة المعالج يتضاعف كل سنتين تقريباً مع انخفاض التكلفة" },
      { id: "C", text: "سرعة الإنترنت تتضاعف سنوياً دون زيادة الأسعار" },
      { id: "D", text: "استهلاك الطاقة يقل للنصف كل 10 سنوات" },
    ],
    correctAnswer: "B",
    explanation: "توقع جوردون مور عام 1965 أن كثافة الترانزستورات على شريحة السيليكون تتضاعف تقريباً كل عامين مع انخفاض تكلفتها، مما شكل الدافع الرئيسي لقفزات الأداء الهائلة وتصغير الأجهزة الذكية.",
    difficulty: "medium",
  },
  {
    questionId: "q_it_3",
    topic: "الدرس 1-1: الحوسبة السحابية والطرفية",
    question: "لماذا تعتمد أنظمة السيارات ذاتية القيادة وأجهزة إنترنت الأشياء (IoT) على «الحوسبة الطرفية - Edge Computing» بدلاً من الاعتماد الكلي على السحابة؟",
    options: [
      { id: "A", text: "لتقليل استهلاك بطارية المركبة فقط" },
      { id: "B", text: "لمعالجة البيانات بالقرب من مصدرها لتقليل زمن الاستجابة (Latency) واتخاذ قرارات فورية" },
      { id: "C", text: "لأن السحابة لا تستطيع تخزين مقاطع الفيديو إطلاقاً" },
      { id: "D", text: "لأن الحوسبة الطرفية تعمل بدون معالجات" },
    ],
    correctAnswer: "B",
    explanation: "في أنظمة السلامة والقيادة الذاتية، التأخير ولو لأجزاء من الثانية قد يؤدي لحادث؛ لذا تتم المعالجة الحسابية محلياً عند حافة الشبكة (Edge) لتفادي زمن نقل البيانات لخوادم سحابية بعيدة.",
    difficulty: "medium",
  },
  {
    questionId: "q_it_4",
    topic: "الدرس 1-1: التقنيات الناشئة والكمومية",
    question: "ما هي الوحدة الحسابية الأساسية في «الحوسبة الكمومية - Quantum Computing» القادرة على التواجد في حالة تراكب كمي (Superposition)؟",
    options: [
      { id: "A", text: "البت التقليدي (Classical Bit)" },
      { id: "B", text: "الكيوبت (Qubit)" },
      { id: "C", text: "البايت الكمومي (Q-Byte)" },
      { id: "D", text: "النانوميتر (Nanometer)" },
    ],
    correctAnswer: "B",
    explanation: "الكيوبت (Qubit) هو وحدة البت الكمومي، وبفضل ظاهرتي التراكب (Superposition) والتشابك الكمي (Entanglement)، يمكن للكيوبت تمثيل الحالتين 0 و 1 معاً مما يضاعف القدرة الحسابية أضعافاً مضاعفة.",
    difficulty: "hard",
  },
  {
    questionId: "q_it_5",
    topic: "الدرس 1-1: فيزياء الحوسبة وقانون مور",
    question: "مع اقتراب تصنيع الترانزستورات من الأبعاد الذرية النانوية (مثل 2nm)، ما هو التحدي الفيزيائي الحاسم الذي يهدد استمرار «قانون مور» بصورته الكلاسيكية؟",
    options: [
      { id: "A", text: "ظاهرة النفق الكمي (Quantum Tunneling) وتسريب الإلكترونات والحرارة الهائلة" },
      { id: "B", text: "عدم توفر مادة السيليكون الطبيعية في القشرة الأرضية" },
      { id: "C", text: "انخفاض تكلفة المعالجات لدرجة انعدام أرباح الشركات" },
      { id: "D", text: "عدم استيعاب أنظمة التشغيل لأكثر من ترانزستور واحد" },
    ],
    correctAnswer: "A",
    explanation: "عند تصغير الترانزستور لحجم ذرات معدودة، تبدأ الإلكترونات في النفاذ تلقائياً عبر الحواجز (Quantum Tunneling)، مما يُحدث تسريباً كهربائياً وحرارة خطيرة، وهو ما دفع العالم نحو المعالجة المتوازية (Multi-core) والـ GPUs والحوسبة الكمومية.",
    difficulty: "hard",
  },
  {
    questionId: "q_it_6",
    topic: "الدرس 1-1: الحوسبة السحابية والطرفية المتقدمة",
    question: "في منظومة المركبات ذاتية القيادة (Autonomous Vehicles)، لماذا لا يكفي الاعتماد على شبكات الجيل الخامس 5G والحوسبة السحابية وحدها، ويُشترط وجود «الحوسبة الطرفية Edge Computing» داخل السيارة؟",
    options: [
      { id: "A", text: "لأن الحوسبة السحابية غير قادرة على معالجة البيانات النصية" },
      { id: "B", text: "لأن قرارات الفرملة والمناورة تتطلب زمناً أقل من 10ms (Real-time latency) وانقطاع الشبكة المفاجئ قد يسبب كوارث" },
      { id: "C", text: "لأن الكاميرات الرادارية لا ترسل بيانات إلكترونية" },
      { id: "D", text: "لأن استهلاك السحابة للكهرباء ممنوع قانونياً في القيادة" },
    ],
    correctAnswer: "B",
    explanation: "حتى مع سرعة 5G، قد تواجه المركبة مناطق حجب إشارة (Dead Zones) أو تأخيرات في الشبكة (Jitter)؛ وبما أن قرارات الحوادث تتطلب أجزاء من الثانية (Zero-tolerance latency)، يجب أن تتم المعالجة الحسابية محلياً بالكامل على معالجات السيارة الطرفية.",
    difficulty: "hard",
  },

  // ── الدرس 1-2: كيف يعمل الذكاء الاصطناعي ──
  {
    questionId: "q_ai_1",
    topic: "الدرس 1-2: كيف يعمل الذكاء الاصطناعي",
    question: "أي من العبارات التالية تصف العلاقة الهرمية الصحيحة بين مجالات الذكاء الاصطناعي؟",
    options: [
      { id: "A", text: "التعلم العميق يشتمل على الذكاء الاصطناعي والتعلم الآلي" },
      { id: "B", text: "الذكاء الاصطناعي (AI) > التعلم الآلي (ML) > التعلم العميق (DL) > الذكاء التوليدي (GenAI)" },
      { id: "C", text: "الذكاء التوليدي منفصل تماماً عن التعلم الآلي" },
      { id: "D", text: "التعلم الآلي والذكاء الاصطناعي هما نفس الشيء تماماً بلا فرق" },
    ],
    correctAnswer: "B",
    explanation: "الذكاء الاصطناعي (AI) هو المظلة الكبرى، يتفرع منه التعلم الآلي (ML) الذي يتعلم من البيانات، ويتفرع منه التعلم العميق (DL) القائم على الشبكات العصبية متعددة الطبقات، وتعد النماذج التوليدية (GenAI) تطبيقاً متقدماً للتعلم العميق.",
    difficulty: "easy",
  },
  {
    questionId: "q_ai_2",
    topic: "الدرس 1-2: الشبكات العصبية الاصطناعية",
    question: "في الشبكة العصبية الاصطناعية (ANN)، ما هي وظيفة «الطبقات المخفية - Hidden Layers»؟",
    options: [
      { id: "A", text: "استقبال البيانات الخام من المستخدم فقط دون أي تعديل" },
      { id: "B", text: "استخراج الميزات والأنماط المعقدة وتعديل الأوزان (Weights) للوصول للاستنتاج" },
      { id: "C", text: "عرض النتيجة النهائية للمستخدم على الشاشة" },
      { id: "D", text: "إيقاف عمل الشبكة عند حدوث أخطاء" },
    ],
    correctAnswer: "B",
    explanation: "الطبقات المخفية (Hidden Layers) هي العقل المحرك للشبكة العصبية؛ حيث تستقبل الإشارات من الطبقة السابقة وتجري عليها تحويلات رياضية غير خطية وتعدل الأوزان (Weights والـ Biases) لاستخلاص الأنماط والملامح.",
    difficulty: "medium",
  },
  {
    questionId: "q_ai_3",
    topic: "الدرس 1-2: موثوقية الذكاء الاصطناعي",
    question: "ماذا يُقصد بمصطلح «هلوسة الذكاء الاصطناعي - AI Hallucination» في النماذج اللغوية الكبيرة (LLMs)؟",
    options: [
      { id: "A", text: "بطء استجابة النموذج عند كثرة المستخدمين" },
      { id: "B", text: "توليد النموذج لإجابات واثقة ومقنعة لغوياً ولكنها خاطئة تماماً أو غير حقيقية" },
      { id: "C", text: "توقف الخادم بسبب هجوم إلكتروني" },
      { id: "D", text: "ترجمة النصوص بين اللغات بدقة متناهية" },
    ],
    correctAnswer: "B",
    explanation: "الهلوسة (Hallucination) تحدث عندما يولد النموذج إجابات تبدو صحيحة ومسبوكة لغوياً بشكل مقنع جداً، لكنها في الواقع تحتوي على معلومات مختلقة أو غير صحيحة علمياً.",
    difficulty: "medium",
  },

  // ── الفصل 2: الأمن السيبراني ──
  {
    questionId: "q_sec_1",
    topic: "الفصل 2: تقنيات التشفير والمصادقة",
    question: "ما الفرق الأساسي بين التشفير المتماثل (Symmetric) والتشفير غير المتماثل (Asymmetric)؟",
    options: [
      { id: "A", text: "التشفير المتماثل يستخدم مفتاحين، بينما غير المتماثل يستخدم مفتاحاً واحداً" },
      { id: "B", text: "التشفير المتماثل يستخدم نفس المفتاح السري للتشفير وفك التشفير، بينما غير المتماثل يستخدم زوج مفاتيح (عام وخاص)" },
      { id: "C", text: "التشفير المتماثل لا يمكن فك تشفيره نهائياً" },
      { id: "D", text: "التشفير غير المتماثل مخصص لكلمات المرور فقط" },
    ],
    correctAnswer: "B",
    explanation: "التشفير المتماثل (مثل AES) يعتمد على مفتاح سري موحد للطرفين، وهو سريع جداً في تشفير كميات البيانات الكبيرة. أما غير المتماثل (مثل RSA) فيستخدم المفتاح العام (Public) للتشفير والمفتاح الخاص (Private) لفك التشفير بأمان.",
    difficulty: "medium",
  },
  {
    questionId: "q_sec_2",
    topic: "الفصل 2: تصميم أمن الشبكات",
    question: "ما هو المفهوم الجوهري لاستراتيجية «انعدام الثقة - Zero Trust Architecture» في الأمن السيبراني؟",
    options: [
      { id: "A", text: "منح الموظفين داخل مقر الشركة ثقة كاملة تلقائياً" },
      { id: "B", text: "«لا تثق بأحد افتراضياً وتحقق دائماً» — التحقق الصارم والمستمر من هوية وصلاحية كل طلب وجهاز" },
      { id: "C", text: "عدم استخدام أي برامج حماية جدار ناري (Firewall)" },
      { id: "D", text: "حظر جميع الاتصالات الواردة من خارج الدولة فقط" },
    ],
    correctAnswer: "B",
    explanation: "مبدأ Zero Trust ينص على: (Never Trust, Always Verify). فلا يتم الوثوق بأي جهاز أو مستخدم حتى لو كان داخل الشبكة المحلية للمؤسسة، بل يجب التحقق من الهوية والصلاحيات وسياق كل طلب باستمرار.",
    difficulty: "medium",
  },
  {
    questionId: "q_sec_3",
    topic: "الفصل 2: المصادقة الثنائية (2FA)",
    question: "تعتمد المصادقة متعددة العوامل (MFA / 2FA) على التحقق من عاملين مختلفين على الأقل من بين:",
    options: [
      { id: "A", text: "شيء تعرفه (كلمة المرور) + شيء تمتلكه (هاتف/رمز OTP) + شيء أنت عليه (بصمة/وجه)" },
      { id: "B", text: "كلمتي مرور مختلفتين لنفس الحساب" },
      { id: "C", text: "اسم المستخدم والبريد الإلكتروني فقط" },
      { id: "D", text: "سؤال الأمان وتاريخ الميلاد فقط" },
    ],
    correctAnswer: "A",
    explanation: "ركائز المصادقة الثلاث هي: 1. Something you know (كلمة سر)، 2. Something you have (هاتف/تطبيق مصادقة)، 3. Something you are (بصمة إصبع/التعرف على الوجه). الجمع بين اثنين منها يحمي الحساب حتى لو سُرقت كلمة المرور.",
    difficulty: "easy",
  },

  // ── الفصل 3: تطبيقات الويب ──
  {
    questionId: "q_web_1",
    topic: "الفصل 3: معمارية تطبيقات الويب",
    question: "في معمارية تطبيقات الويب ثلاثية الطبقات (3-Tier Architecture)، ما هي الطبقات الثلاث؟",
    options: [
      { id: "A", text: "المتصفح ➔ نظام التشغيل ➔ المعالج" },
      { id: "B", text: "طبقة العرض (Presentation Tier) ➔ طبقة المنطق والتطبيق (Application Tier) ➔ طبقة البيانات (Data Tier)" },
      { id: "C", text: "HTML ➔ CSS ➔ JavaScript" },
      { id: "D", text: "الراوتر ➔ السويتش ➔ السيرفر" },
    ],
    correctAnswer: "B",
    explanation: "تتكون المعمارية القياسية من: 1. Presentation Tier (واجهة المستخدم في المتصفح)، 2. Application Tier (السيرفر وخوادم المعالجة والمنطق البرمجي)، 3. Data Tier (قواعد البيانات مثل PostgreSQL لحفظ واسترجاع البيانات).",
    difficulty: "easy",
  },
  {
    questionId: "q_web_2",
    topic: "الفصل 3: بروتوكول HTTP ورموز الاستجابة",
    question: "إذا قام العميل بطلب صفحة ويب وحصل على رمز الاستجابة (HTTP 404 Not Found)، فهذا يعني أن:",
    options: [
      { id: "A", text: "الطلب تم بنجاح والسيرفر أعاد الصفحة المطلوبة" },
      { id: "B", text: "السيرفر واجه خطأ داخلياً في برمجته وتعطل" },
      { id: "C", text: "السيرفر استلم الطلب ولكن المسار أو المورد المطلوب غير موجود لديه" },
      { id: "D", text: "المستخدم غير مسجل الدخول ويحتاج صلاحيات" },
    ],
    correctAnswer: "C",
    explanation: "رمز 404 (Not Found) يعني أن السيرفر متصل وتلقى الطلب لكن الرابط أو الملف المطلوب غير موجود على الخادم. (بينما 200 تعني نجاح، و 401 تعني غير مصرح، و 500 تعني خطأ برمجي بالسيرفر).",
    difficulty: "easy",
  },
  {
    questionId: "q_web_3",
    topic: "الفصل 3: طرق طلبات HTTP",
    question: "ما هي طريقة طلب الـ HTTP (Method) الأكثر ملاءمة عند إرسال بيانات حساسة كنموذج تسجيل دخول أو إنشاء حساب جديد على الخادم؟",
    options: [
      { id: "A", text: "GET" },
      { id: "B", text: "POST" },
      { id: "C", text: "HEAD" },
      { id: "D", text: "OPTIONS" },
    ],
    correctAnswer: "B",
    explanation: "طلب POST يضع البيانات داخل جسم الطلب (Request Body) وليس في رابط الـ URL المكشوف، مما يجعله آمناً ومناسباً لإرسال كلمات المرور والبيانات الحساسة وإنشاء سجلات جديدة.",
    difficulty: "easy",
  },

  // ── البرمجة والتفكير المنطقي ──
  {
    questionId: "q_code_1",
    topic: "البرمجة: بايثون وحلقات التكرار",
    question: "ما هو ناتج تنفيذ الكود التالي في لغة Python؟\n\n```python\nnums = [1, 2, 3, 4]\nresult = [x * 2 for x in nums if x % 2 == 0]\nprint(result)\n```",
    options: [
      { id: "A", text: "[2, 4, 6, 8]" },
      { id: "B", text: "[4, 8]" },
      { id: "C", text: "[2, 6]" },
      { id: "D", text: "[2, 4]" },
    ],
    correctAnswer: "B",
    explanation: "تعبير List Comprehension يقوم أولاً بفلترة الأعداد الزوجية `x % 2 == 0` (وهي 2 و 4)، ثم يضرب كل عدد منها في 2: (2 * 2 = 4) و (4 * 2 = 8)، فيكون الناتج القائمة `[4, 8]`.",
    difficulty: "medium",
  },
  {
    questionId: "q_code_2",
    topic: "البرمجة: الدوال ونطاق المتغيرات",
    question: "ما هو ناتج تنفيذ الكود التالي؟\n\n```javascript\nlet count = 5;\nfunction update() {\n  let count = 10;\n}\nupdate();\nconsole.log(count);\n```",
    options: [
      { id: "A", text: "10" },
      { id: "B", text: "5" },
      { id: "C", text: "undefined" },
      { id: "D", text: "ReferenceError" },
    ],
    correctAnswer: "B",
    explanation: "المتغير `let count = 10` داخل الدالة `update` له نطاق محلي (Block Scope) ولا يغير قيمة المتغير العام `count = 5` المعرف بالخارج؛ لذا ستطبع الدالة `5`.",
    difficulty: "medium",
  },
  {
    questionId: "q_media_1",
    topic: "الفصل 4: مبادئ تصميم الوسائط CRAP",
    question: "في مبادئ تصميم واجهات المستخدم والوسائط (CRAP Principles)، إلى ماذا يرمز حرف (C)؟",
    options: [
      { id: "A", text: "التباين والوضوح البصري (Contrast)" },
      { id: "B", text: "الألوان (Color)" },
      { id: "C", text: "المحتوى (Content)" },
      { id: "D", text: "الإبداع (Creativity)" },
    ],
    correctAnswer: "A",
    explanation: "مبادئ CRAP الأربعة الشهيرة للتصميم هي: Contrast (التباين للتمييز بين العناصر المهمة)، Repetition (التكرار للاتساق البصري)، Alignment (المحاذاة لتنظيم وتوجيه العين)، و Proximity (التقارب لربط العناصر المترابطة معاً).",
    difficulty: "medium",
  },
];

export function generateInteractiveQuestion(query?: string): InteractiveQuestionPayload {
  const q = (query || "").toLowerCase();

  // 0. Direct match for specific question if asked directly
  const directMatch = CURRICULUM_QUESTION_BANK.find((item) =>
    (q.length > 8 && item.question.toLowerCase().includes(q.slice(0, 25))) ||
    (q.includes("ترتيب") && q.includes("زمني") && item.questionId === "q_it_timeline")
  );
  if (directMatch) return directMatch;

  let candidates = CURRICULUM_QUESTION_BANK;

  // Topic classification with typo tolerance (درس/دؤس, اول/أول/1)
  if (/درس.*(أول|اول|1)|دؤس.*(أول|اول|1)|الدرس.*(أول|اول|1)|الدؤس.*(أول|اول|1)|1-1|تطور.*تكنولوجيا|تحول.*اجتماعي|صمامات|قانون مور|حوسبة طرفية|edge computing|كمومية|qubit|ترتيب|زمني|مراحل/i.test(q)) {
    candidates = CURRICULUM_QUESTION_BANK.filter((item) => item.topic.includes("1-1"));
  } else if (/درس.*(ثاني|تاني|2)|دؤس.*(ثاني|تاني|2)|1-2|كيف يعمل الذكاء|شبكات عصبية|هلوسة|neural|genai|توليدي/i.test(q)) {
    candidates = CURRICULUM_QUESTION_BANK.filter((item) => item.topic.includes("1-2"));
  } else if (/فصل.*(ثاني|تاني|2)|أمن|امن|سيبراني|cyber|تشفير|2fa|zero trust|rsa|aes|مفتاح/i.test(q)) {
    candidates = CURRICULUM_QUESTION_BANK.filter((item) => item.topic.includes("الفصل 2"));
  } else if (/فصل.*(ثالث|تالت|3)|ويب|تطبيقات الويب|3-tier|http|status|post|get|404/i.test(q)) {
    candidates = CURRICULUM_QUESTION_BANK.filter((item) => item.topic.includes("الفصل 3"));
  } else if (/فصل.*(رابع|4)|تصميم|وسائط|crap|wireframe|persona|pdca/i.test(q)) {
    candidates = CURRICULUM_QUESTION_BANK.filter((item) => item.topic.includes("الفصل 4"));
  } else if (/بايثون|python/i.test(q)) {
    candidates = CURRICULUM_QUESTION_BANK.filter((item) => item.topic.includes("بايثون"));
  } else if (/جافا|javascript|js/i.test(q)) {
    candidates = CURRICULUM_QUESTION_BANK.filter((item) => item.topic.includes("javascript") || item.topic.includes("الدوال"));
  } else if (/كود|برمجة|تكويد|برمجيات|coding|خوارزم/i.test(q)) {
    candidates = CURRICULUM_QUESTION_BANK.filter((item) => item.topic.includes("البرمجة"));
  }

  // Difficulty filter: if user requested hardest / tough question (أصعب / اصعب / اصعي / صعب / تحدي)
  const wantsHard = /صعب|أصعب|اصعب|اصعي|تحدي|متقدم|معقد|hard|tough|difficult|challeng/i.test(q);
  if (wantsHard) {
    const hardCandidates = candidates.filter((item) => item.difficulty === "hard");
    if (hardCandidates.length > 0) {
      candidates = hardCandidates;
    }
  }

  if (!candidates || candidates.length === 0) candidates = CURRICULUM_QUESTION_BANK;

  return candidates[Math.floor(Math.random() * candidates.length)];
}

function fallbackResponse(
  userMessage: string,
  ctx: StudentContext,
  history: ChatMessage[],
  notifications?: string,
): AIChatResult {
  const input = userMessage.trim();
  const actions: AIAction[] = [];
  let message = "";

  const { state, data } = getMenuState(history);

  // ── Back to menu from any state ──
  if (input === "0" || input.includes("رجوع") || input.includes("القائمة")) {
    return { message: buildMainMenu(ctx, notifications), actions: [], source: "fallback" };
  }

  // ── State: Grade - Select Quiz (3a) ──
  if (state === "3a") {
    const code = input.toUpperCase().replace(/\s/g, "");
    const allQuizzes = ctx.courses.flatMap((c) =>
      c.quizResults.filter((q) => q.date).map((q) => ({
        quizId: q.quizId, quizTitle: q.quizTitle, courseTitle: c.title,
        code: q.quizId.slice(-8).toUpperCase(), percentage: q.percentage,
      }))
    );
    const selected = allQuizzes.find((q) => q.code === code || (code.length >= 4 && q.code.includes(code)));
    if (selected) {
      message = `✅ ${selected.quizTitle} (${selected.courseTitle})\nدرجتك: ${Math.round(selected.percentage)}%\n\n⬇️ اكتب سبب التعديل بالتفصيل:\n• رقم السؤال\n• إجابتك الصحيحة\n• ليه تفتكر إنها صح\n\n💡 مثال: "سؤال 2 إجابتي ب وهي الصح لأن..."\n\nاكتب 0 للرجوع\n\n[م:3b:${selected.quizId}]`;
    } else {
      message = `❌ كود غلط. اكتب الكود من القائمة (8 حروف).\n\nاكتب 0 للرجوع\n\n[م:3a]`;
    }
    return { message, actions, source: "fallback" };
  }

  // ── State: Grade - Write Reason (3b) ──
  if (state === "3b" && data) {
    if (input.length < 20) {
      message = `❌ السبب قصير (${input.length}/20 حرف). اكتب تفاصيل أكتر.\n\nاكتب 0 للرجوع\n\n[م:3b:${data}]`;
    } else {
      const staffCtx = buildChatContextForStaff(history, ctx);
      actions.push({
        type: "create_grade_request",
        payload: { quizId: data, reason: input, evidence: JSON.stringify(staffCtx) },
      });
      message = `✅ تم إرسال طلب تعديل الدرجة للمعلم!\n\n📋 السبب: ${input.slice(0, 80)}${input.length > 80 ? "..." : ""}\n\n⏳ المعلم هيراجع طلبك. اكتب 5 لمتابعة الحالة.\n\nاكتب 0 للرجوع\n\n[م:menu]`;
    }
    return { message, actions, source: "fallback" };
  }

  // ── Study plan intent — recognized in ANY state ──
  const isPlanMod = input.includes("بدل") || input.includes("بدلا") ||
    input.includes("اشوف") || input.includes("أشوف") ||
    (input.includes("غير") && (input.includes("فيديو") || input.includes("خطة") || input.includes("جدول"))) ||
    (input.includes("عايز") && (input.includes("فيديو") || input.includes("درس")));

  if (isPlanMod) {
    // Extract number from message if present
    const numMatch = input.match(/(\d+)/);
    const requestedCount = numMatch ? parseInt(numMatch[1]) : null;
    const plan = buildStudyPlan(ctx);
    const modNote = requestedCount !== null
      ? `\n\n💡 طيب — لو حابب تشوف ${requestedCount} بس يومياً ده شاطر! الخطة المعدّلة موجودة فوق. غير عدد الفيديوهات من صفحة الكورس.`
      : "\n\n💡 ممكن تعدّل الخطة بنفسك من صفحة الكورس — اختار عدد الفيديوهات اللي تقدر عليه.";
    message = plan.replace("\n\nاكتب 0 للرجوع", modNote + "\n\nاكتب 0 للرجوع");
    return { message, actions, source: "fallback" };
  }

  // ── State: Complaint - Write Details (4a) ──
  if (state === "4a") {
    if (input.length < 10) {
      message = `❌ اكتب تفاصيل أكتر (${input.length}/10 حرف).\n\nاكتب 0 للرجوع\n\n[م:4a]`;
    } else {
      const staffCtx = buildChatContextForStaff(history, ctx);
      const courseId = ctx.courses.length > 0 ? ctx.courses[0].id : undefined;
      actions.push({
        type: "create_ticket",
        payload: {
          title: `شكوى: ${input.slice(0, 50)}`,
          description: input,
          type: "complaint",
          priority: "normal",
          courseId,
          chatHistory: staffCtx.chatHistory,
          studentInfo: staffCtx.studentInfo,
        },
      });
      message = `✅ تم تسجيل شكواك!\n\n📋 ${input.slice(0, 80)}${input.length > 80 ? "..." : ""}\n\n⏳ هيتم مراجعتها. اكتب 5 لمتابعة الحالة.\n\nاكتب 0 للرجوع\n\n[م:menu]`;
    }
    return { message, actions, source: "fallback" };
  }

  // ── Rich intent detection (no AI needed) ────────────────────────────────
  const choice = input.replace(/[^\d]/g, "");
  const nm = ctx.profile.name?.split(" ")[0] ?? "صديقي";
  const i = input; // short alias

  // ── Intent flags ─────────────────────────────────────────────────────────

  const isPerf = choice === "1"
    || /أداء|اداء|حلل|تحليل|درج|قوت|قوة|علام|نتيج|نتيجة|تقييم|مجموع|score|grade|grades|result|results|performance|how.*am.*i|how.*doing|quiz result|my mark|marks/i.test(i);

  const isPlan = choice === "2"
    || /خطة|خطه|جدول|اذاكر|أذاكر|مراجعة|مراجعه|مراجع|النهارده|استعد|هذاكر|هبدأ|ابدأ|هادرس|ادرس|امتحان|فاين|plan|today|schedule|what.*study|study plan|what should i|what to do|what do i/i.test(i);

  const isEdit = choice === "3"
    || /تعديل.*درج|درج.*تعديل|grade.*fix|fix.*grade|wrong.*grade|grade.*wrong|درجة غلط|غلط.*درجة/i.test(i);

  const isComplaint = choice === "4"
    || /شكوى|شكوه|complaint|report/.test(i)
    || (i.includes("مشكل") && /مدرس|كورس|محتوى|سيء|غلط|خطأ/.test(i));

  const isStatus = choice === "5"
    || /حالة.*طلب|طلب.*حالة|status|my request|pending|check.*request|طلباتي/i.test(i);

  const isThankYou = /^(شكر|شكرا|شكراً|ممنون|يسلمو|مشكور|الله يخليك|يسعدك|جزاك|جزاكم|بارك الله|معك|تمام شكرا|okay thanks|ok thanks|thank|thanks|thx|ty|appreciate|ありがとう)/i.test(i)
    || /شكرا لك|شكراً لك|شكراً جداً|شكرا جدا|شكراً ع|ممتنن|امتنان|كتير شكر/i.test(i);

  const isTired = /تعبت|زهقت|مش قادر|مش قادرة|صعب|صعبة|مضغوط|مضغوطة|ضغط|مستحيل|مش هقدر|مش قادر أكمل|boring|tired|exhausted|stressed|too hard|give up|can't|cant|overwhelmed|fed up|hate studying/i.test(i);

  const isMotivation = /شجع|حافز|motivat|inspire|encourage|ادفعني|ذكرني|فكرني|اقولي حاجة|قولي حاجة تحمسني|تحفيز|زكرني/i.test(i);

  const isPositive = /برافو|عظيم|جامد|ممتاز|رائع|جميل|حلو|يا سلام|مبروك|great|amazing|wow|well done|good job|nice|perfect|excellent|awesome|super|fantastic|congrats|congratulations/i.test(i);

  const isMorning = /^(صباح|good morning|صبح الخير|صباح الخير|morning)/i.test(i);

  const isEvening = /^(مساء|مساء الخير|good evening|good night|ليلة سعيدة|تصبح على خير|evening|night)/i.test(i);

  const isIslamicGreeting = /^(السلام عليكم|وعليكم السلام|سلام عليكم|السلام)/i.test(i);

  const isGreeting = isMorning || isEvening || isIslamicGreeting
    || /^(مرحبا|مرحباً|أهلا|أهلاً|اهلا|هلا|هلاا|هلااا|هلاااا|هلاو|هاي|هلو|هالو|ازيك|عامل|كيفك|كيف حالك|hala|hi|hello|hey|yo|sup|howdy|what.?s up|wassup|hola|greetings)/i.test(i)
    || /^هلا+/i.test(i.trim());

  const isQuestion = /\?|؟|ايه|إيه|ما هو|ما هي|كيف|ليه|why|how|what|when|where|من|who|هل|is it|can you|do you/i.test(i)
    && !isPerf && !isPlan && !isEdit && !isComplaint && !isStatus;

  const isCourseNav = /فين الكورس|فين درس|روح.*كورس|مكتبة|library|my courses|where.*course|كورساتي|دروسي/i.test(i);

  const isBye = /^(bye|goodbye|see you|later|مع السلامة|وداعا|وداعاً|يلا|يلا باي|سلامة|تسلم|ماشي|okay goodbye|ok bye)/i.test(i);

  const isYes = /^(تمام|ايوه|اه|نعم|اوك|اوكي|yes|yeah|yep|ok|okay|sure|alright|بالظبط|صح|كويس|ماشي|yup|yap)$/i.test(i.trim());

  const isNo = /^(لا|نو|no|nope|nah|أبداً|ابدا)$/i.test(i.trim());

  const isLove = /بحبك|أحبك|love you|i love|you are the best|أنت الأفضل|الأحسن|أحسن|تبقى كويس/i.test(i);

  const isAboutBot = /اسمك|مين أنت|من أنت|من انت|مين انت|مين حضرتك|who are you|what is your name|your name|what are you|بتعمل ايه|بتعمل إيه|ايه دورك|إيه دورك|عنك|عن نفسك|تعرف.*نفسك|about you|شو اسمك|إيش اسمك/i.test(i);

  const isHelp = !isPerf && !isPlan && !isEdit && !isComplaint && !isStatus
    && (/ساعد|مساعدة|help|assist|support|محتاج|محتاجة|ممكن|قدرني|عايز حاجة|أريد|ابدأ|start/i.test(i) || isGreeting || isMorning || isEvening);

  // ── Pick response ─────────────────────────────────────────────────────────

  // ── Curriculum & Subject Intent Detection ──────────────────────────────────
  const isCurriculumL1 = /الدرس الأول|الدرس الاول|درس 1|1-1|تطور تكنولوجيا|تحول اجتماعي|صمامات مفرغة|قانون مور|eniac|moore|حوسبة طرفية|edge computing|حوسبة كمومية|quantum/i.test(i);
  const isCurriculumL2 = /الدرس الثاني|الدرس التاني|درس 2|1-2|كيف يعمل الذكاء|شبكات عصبية|neural network|هلوسة|hallucination|تعلم آلي/i.test(i);
  const isCurriculumL3 = /الدرس الثالث|الدرس التالت|درس 3|1-3|الحياة اليومية والصناعة|تطبيقات الذكاء/i.test(i);
  const isCurriculumL4 = /الدرس الرابع|درس 4|1-4|القضايا الأخلاقية|أخلاقيات الذكاء/i.test(i);
  const isCurriculumCh2 = /الفصل الثاني|الفصل التاني|أمن سيبراني|الامن السيبراني|تشفير|2-1|2-2|2-3|tls|https|zero trust|2fa|dmz|جدار الحماية/i.test(i);
  const isCurriculumCh3 = /الفصل الثالث|الفصل التالت|تطبيقات الويب|3-1|3-2|web app|http status|html الدلالية/i.test(i);
  const isCurriculumCh4 = /الفصل الرابع|الفصل الرابع|تصميم الوسائط|crap|wireframe|persona|pdca|4-1|4-2/i.test(i);
  const isCurriculumGeneral = /المنهج|منهج|تانية ثانوي|2 ثانوي|ثانوية|منهج الوزارة|محتوى المنهج|كتاب الوزارة|curriculum/i.test(i);

  const isAPI = /api|واجهة برمجية|واجهه برمجيه/i.test(i);
  const isCoding = /coding|كود|برمجة|تكويد|برمجيات|برنامج|python|javascript|c\+\+|html|css|java|react|node|sql|database|backend|frontend/i.test(i);
  const isExplainOrHelp = /اشرح|شرح|فهمني|فهم الفكرة|فهمتني|وضح|توضيح|مفهوم|ما هو|ما هي|ماذا يعني|ما معنى|معنى|تعريف|ساعدني|السؤال الحالي|ولا تعطيني الإجابة|ولا تعطني الإجابة|ليه|لماذا|ازاي|إزاي|حللي|حل لي|تفسير|فسر|عايز أفهم|عاوز افهم/i.test(i);

  const isExplicitQuizRequest = !isExplainOrHelp && (
    /^(اسألني|اسالني|اختبرني|اختبرنى|امتحني|امتحنى|اديني سؤال|هات سؤال|اعملي كويز|اعمل كويز|quiz|test me|ask me)/i.test(i.trim()) ||
    ((i.includes("اديني") || i.includes("هات") || i.includes("اعمل") || i.includes("عايز") || i.includes("عاوز")) &&
     (i.includes("سؤال") || i.includes("سوال") || i.includes("كويز") || i.includes("اختبار") || i.includes("تحدي")))
  );

  if (isExplicitQuizRequest) {
    const qData = generateInteractiveQuestion(i);
    actions.push({
      type: "interactive_question",
      payload: qData,
    });
    message = `🎯 **تحدي تدريبي في ${qData.topic}!**\n\nاختر الإجابة الصحيحة بالأسفل لتكتشف النتيجة والتفسير النموذجي فوراً 💡:`;
    return { message, actions, source: "fallback" };
  }

  if (isBye) {
    const byes = [
      `مع السلامة يا ${nm}! 👋 وفقك الله في مذاكرتك. 🌟`,
      `يلا سلامة يا ${nm}! 😊 اتذكر — كل يوم بتذاكر فيه ده استثمار في مستقبلك. 🎯`,
      `وداعاً يا ${nm}! 🌙 لو محتاجني رجعلي في أي وقت. 💙`,
    ];
    message = byes[Math.floor(Date.now() / 1000) % byes.length];

  } else if (isCurriculumL1 || (isCurriculumGeneral && (i.includes("اول") || i.includes("أول") || i.includes("1")))) {
    actions.push({
      type: "navigate",
      payload: { path: "/curriculum/programming-and-ai", reason: "تصفح أسئلة وتفاصيل الدرس الأول" },
    });
    message = `يا هلا بيك يا ${nm}! 🌟 إليك شرح وافٍ ومبسط **للدرس الأول (1-1): تطور تكنولوجيا المعلومات والتحول الاجتماعي** من منهج البرمجة والذكاء الاصطناعي:\n\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `⏳ **1️⃣ الترتيب الزمني الصحيح لمراحل تطور تكنولوجيا المعلومات (IT Timeline):**\n` +
      `1. **بداية ظهور الحاسب (Early Computing)** ➔ في منتصف القرن العشرين مع الصمامات المفرغة (ENIAC) والترانزستورات وظهور الحواسيب.\n` +
      `2. **تسويق الإنترنت تجارياً (Commercialization of Internet)** ➔ في التسعينات مع انتشار شبكة الويب (WWW) وتحول الإنترنت لخدمة عامة وتجارية.\n` +
      `3. **ظهور الهواتف الذكية (Smartphone Era)** ➔ في العقد الأول من الألفية (2007 وما بعدها) مع ثورة التطبيقات المحمولة والاتصال الدائم.\n` +
      `4. **انتشار الحوسبة السحابية (Cloud Computing)** ➔ تخزين ومعالجة البيانات على خوادم عملاقة عبر الإنترنت، وظهور إنترنت الأشياء والذكاء الاصطناعي.\n\n` +
      `💡 **تلميح ذكي لفهم الترتيب والتحدي:**\n` +
      `فكر في التطور كرحلة منطقية: *صنعنا الحاسب أولاً ➔ ثم ربطناه بالإنترنت عالمياً ➔ ثم صغّرناه في جيبنا كهاتف ذكي ➔ ثم نقلنا التخزين والمعالجة للسحابة السحابية*!\n\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `📚 **2️⃣ مفاهيم ومصطلحات أساسية في الدرس:**\n` +
      `• **قانون مور (Moore's Law)**: يتضاعف عدد الترانزستورات على شريحة السيليكون كل عامين تقريباً مع انخفاض التكلفة وزيادة القوة الحاسوبية.\n` +
      `• **الحوسبة الطرفية (Edge Computing)**: معالجة البيانات لحظياً بالقرب من الجهاز لتقليل زمن التأخير (مثل السيارات ذاتية القيادة).\n` +
      `• **الحوسبة الكمومية (Quantum Computing)**: الاعتماد على البتات الكمومية (Qubits) لإجراء عمليات حاسوبية فائقة التعقيد.\n` +
      `• **التحول الاجتماعي والشمول المالي**: التوسع في المدفوعات الرقمية غير النقدية (Cashless) والمعاملات الإلكترونية الآمنة.\n\n` +
      `💡 *اسألني عن أي جزئية تحب نوضحها أكتر!*`;

  } else if (isCurriculumL2 || (isCurriculumGeneral && (i.includes("تاني") || i.includes("ثاني") || i.includes("2")))) {
    actions.push({
      type: "navigate",
      payload: { path: "/curriculum/programming-and-ai", reason: "تصفح أسئلة الدرس الثاني" },
    });
    message = `أهلاً يا ${nm}! 🧠 إليك ملخص **الدرس الثاني (1-2): كيف يعمل الذكاء الاصطناعي**:\n\n` +
      `• **هرمية الذكاء الاصطناعي**: AI > Machine Learning (ML) > Deep Learning (DL) > Generative AI (GenAI).\n` +
      `• **الشبكات العصبية الاصطناعية (ANN)**: مستوحاة من خلايا الدماغ وتتكون من طبقة إدخال (Input)، طبقات مخفية (Hidden)، وطبقة إخراج (Output).\n` +
      `• **مراحل الذكاء الاصطناعي**: مرحلة التدريب (Training على البيانات الضخمة) ومرحلة الاستنتاج والتنبؤ (Inference).\n` +
      `• **مخاطر الهلوسة (AI Hallucination)**: توليد معلومات تبدو مقنعة لكنها غير صحيحة أو غير دقيقة علمياً.\n\n` +
      `💡 *اسألني لو حابب تفهم أي جزء في الشبكات العصبية أو النماذج التوليدية!*`;

  } else if (isCurriculumCh2) {
    actions.push({
      type: "navigate",
      payload: { path: "/curriculum/programming-and-ai", reason: "تصفح أسئلة الأمن السيبراني" },
    });
    message = `🛡️ ملخص **الفصل الثاني: الأمن السيبراني (Cybersecurity)**:\n\n` +
      `• **التشفير المتماثل (Symmetric - مثل AES)**: مفتاح واحد للتشفير وفك التشفير (سريع).\n` +
      `• **التشفير غير المتماثل (Asymmetric - مثل RSA)**: زوج مفاتيح (عام Public وخاص Private).\n` +
      `• **بروتوكول HTTPS ومصافحة TLS**: تأمين نقل البيانات بين المتصفح والخادم لمنع التنصت والتلاعب.\n` +
      `• **المصادقة الثنائية (2FA)**: خطوتان للتحقق (كلمة مرور + رمز OTP على الهاتف).\n` +
      `• **معمارية انعدام الثقة (Zero Trust)**: "لا تثق بأحد وتحقق من كل شيء دائماً".\n` +
      `• **دورة الاستجابة للحوادث**: التحضير ➔ الاكتشاف ➔ الاحتواء ➔ الاستئصال ➔ التعافي ➔ الدروس المستفادة.`;

  } else if (isCurriculumCh3) {
    actions.push({
      type: "navigate",
      payload: { path: "/curriculum/programming-and-ai", reason: "تصفح أسئلة تطبيقات الويب" },
    });
    message = `🌐 ملخص **الفصل الثالث: تطبيقات الويب (Web Applications)**:\n\n` +
      `• **معمارية الطبقات الثلاث (3-Tier Architecture)**: طبقة العرض (Client UI) + طبقة المنطق والتطبيق (Server) + طبقة البيانات (Database).\n` +
      `• **طرق طلبات HTTP**: GET (قراءة بيانات)، POST (إرسال بيانات جديدة)، PUT (تعديل)، DELETE (حذف).\n` +
      `• **رموز الاستجابة (Status Codes)**: 200 (نجاح OK)، 400 (طلب خاطئ)، 401 (غير مصرح)، 404 (الصفحة غير موجودة)، 500 (خطأ بالسيرفر).\n` +
      `• **HTML الدلالية والتصميم المتجاوب (Responsive Design)**.`;

  } else if (isCurriculumGeneral) {
    actions.push({
      type: "navigate",
      payload: { path: "/curriculum/programming-and-ai", reason: "دليل المنهج الدراسي التفاعلي" },
    });
    message = `📚 **منهج البرمجة والذكاء الاصطناعي (الصف الثاني الثانوي - الترم الأول)**:\n\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `1️⃣ **الفصل 1: تكنولوجيا المعلومات والمجتمع**\n` +
      `  • 1-1: تطور تكنولوجيا المعلومات والتحول الاجتماعي\n` +
      `  • 1-2: كيف يعمل الذكاء الاصطناعي\n` +
      `  • 1-3: الذكاء الاصطناعي في الحياة اليومية والصناعة\n` +
      `  • 1-4: القضايا الأخلاقية للذكاء الاصطناعي\n\n` +
      `2️⃣ **الفصل 2: الأمن السيبراني**\n` +
      `  • 2-1: تقنيات التشفير والمصادقة (AES, RSA, TLS)\n` +
      `  • 2-2: تصميم أمن الشبكات (Zero Trust, DMZ)\n` +
      `  • 2-3: الاستجابة للحوادث وإدارة المخاطر\n\n` +
      `3️⃣ **الفصل 3: تطبيقات الويب** (3-Tier, HTTP/HTTPS, Status Codes)\n` +
      `4️⃣ **الفصل 4: تصميم الوسائط** (مبادئ CRAP, Wireframes, دورة PDCA)\n` +
      `━━━━━━━━━━━━━━━━\n\n` +
      `💡 اكتب رقم أو اسم الدرس اللي عايزني أشرحهولك بالتفصيل يا ${nm}!`;

  } else if (isAPI) {
    message = `من عيوني يا بطل! 🌟 الـ API (Application Programming Interface) هي **واجهة برمجية للتطبيقات** بتشتغل كـ "وسيط" أو "جسر" لنقل البيانات بين البرامج والتطبيقات بسهولة جداً! 🌐🔗\n\nتخيل الجرسون اللطيف في المطعم 🍽️ — بتاخد طلبك (Request) وتديه للمطبخ (Server) وترجعلك بالأكل الجميل (Response)!\n\nفي منصة Code-UP، الـ API بيخلي الشاشة دي تتواصل مع السيرفر وتجيب بيانات كورساتك ودرجاتك لحظياً! ⚡\n\nعايز تتعلم أكتر عن البرمجة والـ APIs يا صديقي؟ اكتب **2** لخطة التعلّم! 📚`;

  } else if (isCoding) {
    message = `البرمجة (Coding) هي كتابة تعليمات وأوامر يفهمها الكمبيوتر لبناء مواقع، تطبيقات، وألعاب! 💻🚀\n\nتعتمد البرمجة على حل المشكلات والتفكير المنطقي خطوة بخطوة بلغات مثل JavaScript و Python.\n\nعلى منصة Code-UP بنساعدك تطبق عملي من خلال الكورسات والتطبيقات التفاعلية! 🌟\n\nعايز تبدأ المذاكرة معنا؟ اكتب **2** لخطة التدريب! 📚`;

  } else if (isExplainOrHelp && !isPerf && !isPlan && !isEdit && !isComplaint && !isStatus) {
    message = `أنا تحت أمرك يا ${nm}! 💡\n\nعشان أقدر أشرحلك بدقة، حدد الموضوع اللي عايز تفهمه (مثلاً: "اشرحلي الدرس الأول في المنهج"، "اشرحلي يعني ايه API"، "اشرحلي الأمن السيبراني").\n\nأو تقدر تختار من القائمة الرئيسية مباشرة:\n\n` + buildMainMenu(ctx).replace("اختار رقم:\n\n", "أو اختار:\n");

  } else if (isThankYou) {
    const thanks = [
      `يسعدني خدمتك يا ${nm}! 😊 لو محتاج أي حاجة تاني، أنا هنا دايماً.`,
      `وإياك! 🤝 ده واجبي. لو عندك أي سؤال قولي.`,
      `الشكر لله! 😊 وفقك الله في مذاكرتك يا ${nm}. 🌟`,
      `يسعدك يا ${nm}! 💙 متنساش تذاكر النهارده.`,
    ];
    message = thanks[Math.floor(Date.now() / 1000) % thanks.length];

  } else if (isLove) {
    message = `وأنا أكثر! 😄💙 أنا هنا عشانك يا ${nm}. تعالى نذاكر؟\n\nاكتب 2 وأنا هجيبلك خطتك.`;

  } else if (isAboutBot) {
    message = `أنا **المرشد الذكي** 🌟 على منصة Code-UP!\n\n` +
      `مساعدك الشخصي في المذاكرة والدراسة، ودوري أساعدك في:\n` +
      `• 📊 تحليل أدائك ودرجاتك ونقاط ضعفك\n` +
      `• 📋 خطة تدريبية مخصصة ليك\n` +
      `• ✏️ طلبات تعديل درجات الكويزات\n` +
      `• 📢 تسجيل شكاوى للمعلم أو المحتوى\n` +
      `• 📋 متابعة حالة طلباتك بانتظام\n\n` +
      `قولي إيه اللي محتاجه يا ${nm}؟ 😊`;

  } else if (isTired) {
    const motivation = [
      `يا ${nm}، كل الناجحين مروا بنفس الإحساس ده بالظبط! 💪\n\n"الصبر مفتاح الفرج" — خد راحة 10 دقايق وارجع أقوى. 🔥\n\nلما ترجع اكتب 2 وهجهزلك خطة خفيفة. ✨`,
      `طبيعي جداً تحس بالتعب يا ${nm}! 😊\n\n"الأبطال مش اللي مش بيتعبوا، هم اللي بيكملوا وإنهم تعبانين!" 🏆\n\nشيل شيء صغير النهارده — اكتب 2 وهساعدك.`,
      `زهقت يعني؟ 😄 ده معناه إنك بتشتغل! 💪\n\nغير المكان، اعمل كوباية شاي، وارجع. المذاكرة مش سباق — هي رحلة. 🌟\n\nاكتب 1 تشوف إيه اللي وصلت له لحد دلوقتي.`,
    ];
    message = motivation[Math.floor(Date.now() / 1000) % motivation.length];

  } else if (isMotivation) {
    const motivations = [
      `يا ${nm}، النجاح مش بالموهبة — بالمثابرة! 🔥\n\n"كل يوم بتذاكر فيه بيفرق." — ابدأ بخطوة واحدة صغيرة.\n\nاكتب 2 وأنا هجيبلك خطة النهارده. 💪`,
      `تحفيز يا ${nm}؟ هاهو: 🚀\n\n${ctx.overallStats.totalQuizzesTaken > 0 ? `عملت ${ctx.overallStats.totalQuizzesTaken} كويز! ده إنجاز حقيقي.` : `كل بداية لها نهاية. ابدأ دلوقتي وأنت هتفرق!`}\n\n"الاستمرار هو المفتاح." اكتب 2 لخطتك. ✨`,
      `يا ${nm}, remember this: كل دقيقة بتذاكرها دلوقتي هتفرق في مستقبلك. 💡\n\nما تتأخرش — اكتب 2 وابدأ النهارده! 🎯`,
    ];
    message = motivations[Math.floor(Date.now() / 1000) % motivations.length];

  } else if (isPositive) {
    const cheers = [
      `شكراً يا ${nm}! 🙏 كلامك الحلو بيحمسنا! 🔥 استمر على المستوى ده.`,
      `يا سلام! 😊 وأنت أجمد يا ${nm}! كمل كده وهتوصل لأي هدف. 💪`,
      `وأنت كمان عظيم يا ${nm}! 🌟 إيه اللي ممكن أساعدك فيه دلوقتي؟`,
    ];
    message = cheers[Math.floor(Date.now() / 1000) % cheers.length];

  } else if (isMorning) {
    message = `صباح النور يا ${nm}! ☀️\n\nيوم جديد = فرصة جديدة! 📚\n\nعايز تبدأ يومك صح؟ اكتب **2** وأنا هجيبلك خطة النهارده. 🎯`;

  } else if (isEvening) {
    const evn = new Date().getHours() < 20
      ? `مساء النور يا ${nm}! 🌅 عندك وقت للمذاكرة؟ اكتب **2** لخطة المساء.`
      : `مساء النور يا ${nm}! 🌙 تصبح على خير. لو عندك وقت صغير — اكتب 2 لمراجعة سريعة. ✨`;
    message = evn;

  } else if (isIslamicGreeting) {
    message = i.toLowerCase().startsWith("وع") || i.includes("وعليكم")
      ? `وعليكم السلام ورحمة الله وبركاته يا ${nm}! 😊\n\nكيف أقدر أساعدك النهارده؟\n\n` + buildMainMenu(ctx).replace("اختار رقم:\n\n", "اختار:\n")
      : `وعليكم السلام ورحمة الله يا ${nm}! 😊\n\nإيه اللي محتاجه النهارده؟\n\n` + buildMainMenu(ctx).replace("اختار رقم:\n\n", "اختار:\n");

  } else if (isYes) {
    message = `تمام يا ${nm}! 😊 قولي إيه اللي محتاجه:\n\n` + buildMainMenu(ctx).replace("اختار رقم:\n\n", "");

  } else if (isNo) {
    message = `خير يا ${nm}! 😊 قولي إيه اللي في بالك وأنا هساعدك. ✨`;

  } else if (isCourseNav) {
    message = `📚 كورساتك موجودة في **مكتبتي** من القائمة فوق.\n\nعندك الآن ${ctx.courses.length} كورس${ctx.courses.length > 0 ? ":\n" + ctx.courses.map(c => `• ${c.title}`).join("\n") : " مسجّل."}\n\nعايز خطة مذاكرة؟ اكتب **2** ⬇️\n\n[م:menu]`;

  } else if (isPerf) {
    message = buildPerformanceAnalysis(ctx);

  } else if (isPlan) {
    message = buildStudyPlan(ctx);

  } else if (isEdit) {
    const { list, hasQuizzes } = buildQuizList(ctx);
    if (hasQuizzes) {
      message = `✏️ طلب تعديل درجة\n\nكويزاتك:\n${list}\n\n⬇️ اكتب كود الكويز:\n\nاكتب 0 للرجوع\n\n[م:3a]`;
    } else {
      message = `مفيش كويزات محلولة لسه.\n\n${buildMainMenu(ctx)}`;
    }

  } else if (isComplaint) {
    const courseList = ctx.courses.length > 0
      ? ctx.courses.map((c) => `• ${c.title} (${c.subject})`).join("\n") + "\n\n"
      : "";
    message = `📢 تقديم شكوى\n\n${courseList}⬇️ اكتب تفاصيل شكواك أو المشكلة:\n\nاكتب 0 للرجوع\n\n[م:4a]`;

  } else if (isStatus) {
    actions.push({ type: "show_insights", payload: { checkStatus: true } });
    message = `📋 جاري تحميل حالة طلباتك...\n\n[م:5]`;

  } else if (isGreeting) {
    message = `أهلاً وسهلاً يا ${nm}! 😊 إيه الأخبار؟ كيف أقدر أساعدك في كورساتك أو المذاكرة النهاردة؟ ✨\n\n` + buildMainMenu(ctx).replace("اختار رقم:\n\n", "أو اختار من القائمة:\n");

  } else if (isQuestion) {
    message = `سؤالك وصلني يا ${nm}! 🤔\n\nأنا مساعدك في الكورسات والدراسة على Code-UP. اختار اللي محتاجه:\n\n` + buildMainMenu(ctx).replace("اختار رقم:\n\n", "");

  } else if (isHelp) {
    message = `أهلاً يا ${nm}! 😊 أنا مرشدك الذكي على Code-UP.\n\nممكن أساعدك في:\n• تحليل أداءك ودرجاتك 📊\n• خطة مذاكرة مخصصة 📋\n• طلب تعديل درجة ✏️\n• تسجيل شكوى 📢\n\nقولي إيه اللي محتاجه! 💪\n\n` + buildMainMenu(ctx).replace("اختار رقم:\n\n", "أو اختار:\n");

  } else {
    message = buildMainMenu(ctx, notifications);
  }

  return { message, actions, source: "fallback" };
}

async function callResolvedProvider(provider: ResolvedProvider, messages: ChatMessage[]): Promise<AIChatResult | null> {
  const sys = messages.find((m) => m.role === "system")?.content || "";
  const userMsgs = messages.filter((m) => m.role !== "system");

  try {
    if (provider.kind === "gemini") {
      const promptText = sys
        ? `[النظام: ${sys}]\n\n` + userMsgs.map((m) => `${m.role === "user" ? "المتعلم" : "المرشد"}: ${m.content}`).join("\n")
        : userMsgs.map((m) => `${m.role === "user" ? "المتعلم" : "المرشد"}: ${m.content}`).join("\n");
      const url = `${provider.baseUrl}/models/${provider.model}:generateContent?key=${provider.key}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: { maxOutputTokens: 1200, temperature: 0.7 },
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (!raw) return null;
      return { message: raw, actions: [], source: "backup" };

    } else if (provider.kind === "anthropic") {
      const res = await fetch(provider.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": provider.key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: provider.model,
          max_tokens: 1200,
          temperature: 0.7,
          system: sys,
          messages: userMsgs.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const raw = data.content?.[0]?.text || "";
      if (!raw) return null;
      return parseAIResponse(raw, "primary");

    } else {
      const res = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${provider.key}`,
        },
        body: JSON.stringify({
          model: provider.model,
          messages: [
            { role: "system", content: sys },
            ...userMsgs.map((m) => ({ role: m.role, content: m.content })),
          ],
          max_tokens: 1200,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content || "";
      if (!raw) return null;
      return parseAIResponse(raw, "primary");
    }
  } catch (err) {
    console.error(`[callResolvedProvider] Provider ${provider.name} failed:`, err);
    return null;
  }
}

export async function chatWithAI(
  userMessage: string,
  history: ChatMessage[],
  studentContext: StudentContext,
  notifications?: string,
  requestSignal?: AbortSignal,
): Promise<AIChatResult> {
  // 0. Ultra-fast local fast-path only for explicit quiz requests (NOT for tutoring/concept explanation)
  const isExplainOrHelpMsg = /اشرح|شرح|فهمني|فهم الفكرة|فهمتني|وضح|توضيح|مفهوم|ما هو|ما هي|ماذا يعني|ما معنى|معنى|تعريف|ساعدني|السؤال الحالي|ولا تعطيني الإجابة|ولا تعطني الإجابة|ليه|لماذا|ازاي|إزاي|حللي|حل لي|تفسير|فسر|عايز أفهم|عاوز افهم/i.test(userMessage);

  const isExplicitQuizIntent = !isExplainOrHelpMsg && (
    /^(اسألني|اسالني|اختبرني|اختبرنى|امتحني|امتحنى|اديني سؤال|هات سؤال|اعملي كويز|اعمل كويز|quiz|test me|ask me)/i.test(userMessage.trim()) ||
    ((userMessage.includes("اديني") || userMessage.includes("هات") || userMessage.includes("اعمل") || userMessage.includes("عايز") || userMessage.includes("عاوز")) &&
     (userMessage.includes("سؤال") || userMessage.includes("سوال") || userMessage.includes("كويز") || userMessage.includes("اختبار") || userMessage.includes("تحدي")))
  );

  if (isExplicitQuizIntent) {
    return fallbackResponse(userMessage, studentContext, history, notifications);
  }

  const contextSummary = summarizeContext(studentContext);
  const cleanHistory = history.slice(-8).map((m) => ({
    role: m.role,
    content: stripFallbackMarkers(m.content),
  })).filter((m) => m.content.length > 0);

  let curriculumGrounding = "";
  try {
    const { CurriculumRetriever } = await import("@/ai/knowledge/curriculum/CurriculumRetriever");
    const { buildGrounding } = await import("@/ai/knowledge/curriculum/CurriculumGrounding");
    const retriever = CurriculumRetriever.getInstance();
    const results = await retriever.retrieve({ question: userMessage, limit: 3 });
    if (results && results.length > 0) {
      const g = buildGrounding(results);
      if (g.promptBlock) {
        curriculumGrounding = `\n\n${g.promptBlock}`;
      }
    }
  } catch {
    // Best-effort curriculum grounding
  }

  const messages: ChatMessage[] = [
    { role: "system", content: `${SYSTEM_PROMPT}\n\n${contextSummary}${curriculumGrounding}` },
    ...cleanHistory,
    { role: "user", content: userMessage },
  ];

  // 1. Try Google Gemini Pool (with fast 2.5s timeout)
  try {
    const geminiResult = await callBackup(messages, requestSignal);
    if (geminiResult?.message) {
      geminiResult.message = stripFallbackMarkers(geminiResult.message);
      return geminiResult;
    }
  } catch (err) {
    console.warn("[chatWithAI] Gemini call failed:", err);
  }

  // 2. Try Primary / DeepSeek / XKiro / Groq if configured
  try {
    const primaryResult = await callPrimary(messages, requestSignal);
    if (primaryResult?.message) {
      primaryResult.message = stripFallbackMarkers(primaryResult.message);
      return primaryResult;
    }
  } catch (err) {
    console.warn("[chatWithAI] Primary call failed:", err);
  }

  try {
    const xkiroResult = await callXKiro(messages, requestSignal);
    if (xkiroResult?.message) {
      xkiroResult.message = stripFallbackMarkers(xkiroResult.message);
      return xkiroResult;
    }
  } catch (err) {
    console.warn("[chatWithAI] XKiro call failed:", err);
  }

  try {
    const groqResult = await callGroq(messages, requestSignal);
    if (groqResult?.message) {
      groqResult.message = stripFallbackMarkers(groqResult.message);
      return groqResult;
    }
  } catch (err) {
    console.warn("[chatWithAI] Groq call failed:", err);
  }

  // 3. Instant Smart Local Fallback (< 5ms response time)
  // Handles curriculum explanations, study planning, performance analytics, and actions seamlessly!
  return fallbackResponse(userMessage, studentContext, history, notifications);
}

export async function analyzeQuizAnswer(
  question: string,
  studentAnswer: string,
  correctAnswer: string,
  options: Record<string, string>
): Promise<{ wasMisgraded: boolean; reasoning: string; confidence: number }> {
  const prompt = `حلل سؤال الكويز ده:

السؤال: ${question}
خيارات: ${JSON.stringify(options, null, 2)}
إجابة المتعلم: ${studentAnswer}
الإجابة المعتمدة: ${correctAnswer}

هل إجابة المتعلم فعلاً غلط؟ أو ممكن تكون صحيحة من ناحية أخرى؟ ممكن السؤال يكون غامض؟

رد بـ JSON:
{
  "wasMisgraded": boolean,
  "reasoning": "سبب القرار بالعربي",
  "confidence": 0-1
}`;

  const messages: ChatMessage[] = [
    { role: "system", content: "أنت مدرس خبير تحلل أسئلة الكويزات بدقة. ترد بـ JSON فقط." },
    { role: "user", content: prompt },
  ];

  const result = await callBackup(messages);
  if (result?.message) {
    try {
      const match = result.message.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : null;
      if (parsed) {
        return {
          wasMisgraded: !!parsed.wasMisgraded,
          reasoning: String(parsed.reasoning || ""),
          confidence: Number(parsed.confidence || 0.5),
        };
      }
    } catch {
      // Fall through
    }
  }

  return {
    wasMisgraded: false,
    reasoning: "الذكاء الاصطناعي قيد التحديث حالياً، يرجى مراجعة المعلم مباشرة",
    confidence: 0,
  };
}

export async function generateInsights(
  studentContext: StudentContext
): Promise<Array<{ type: string; category: string; title: string; description: string; confidence: number }>> {
  const ctx = summarizeContext(studentContext);
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "أنت محلل تدريبي. حلل بيانات المتعلم واستخرج 3-5 رؤى مهمة (نقاط قوة، نقاط ضعف، توصيات، تحذيرات). رد بـ JSON.",
    },
    {
      role: "user",
      content: `${ctx}\n\nأعطني JSON:\n{ "insights": [{ "type": "weak_area"|"strength"|"recommendation"|"risk_alert", "category": "math"|"physics"|...|"general", "title": "عنوان قصير", "description": "وصف مفصل", "confidence": 0-1 }] }`,
    },
  ];

  const result = await callBackup(messages);
  if (result?.message) {
    try {
      const match = result.message.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : null;
      if (parsed?.insights && Array.isArray(parsed.insights)) {
        return parsed.insights;
      }
    } catch {
      // Fall through
    }
  }

  // Generate from context
  const insights: Array<{ type: string; category: string; title: string; description: string; confidence: number }> = [];
  for (const weak of studentContext.weakAreas.slice(0, 3)) {
    insights.push({
      type: "weak_area",
      category: weak.subject,
      title: `ضعف في ${weak.topic}`,
      description: `${weak.reason}. ${weak.evidence}`,
      confidence: 0.8,
    });
  }
  if (studentContext.overallStats.averageScore >= 80) {
    insights.push({
      type: "strength",
      category: "general",
      title: "أداء متميز",
      description: `متوسطك ${studentContext.overallStats.averageScore}% - استمر!`,
      confidence: 0.9,
    });
  }
  return insights;
}
