import { NextRequest, NextResponse } from "next/server";
import { getStudentSession, getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildStudentContext } from "@/lib/ai-context";
import { chatWithAI, type ChatMessage, type AIAction } from "@/lib/ai-assistant";

const activeAiRequests = new Map<string, number>();
const MAX_ACTIVE_AI_REQUESTS = 3;

export async function POST(req: NextRequest) {
  let requestSessionId: string | null = null;
  let requestCounted = false;
  try {
    // Accept students AND admins/owners (they need to test the chat too)
    const session = await getStudentSession() ?? await getSession();
    if (!session) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const { message } = await req.json();
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "الرسالة مطلوبة" }, { status: 400 });
    }

    const trimmedMsg = message.trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, 4000);
    if (!trimmedMsg) {
      return NextResponse.json({ error: "الرسالة مطلوبة" }, { status: 400 });
    }
    requestSessionId = session.id;
    const active = activeAiRequests.get(session.id) ?? 0;
    if (active >= MAX_ACTIVE_AI_REQUESTS) {
      return NextResponse.json({ error: "هناك محادثات ذكاء اصطناعي نشطة كثيرة. حاول بعد لحظات." }, { status: 429 });
    }
    activeAiRequests.set(session.id, active + 1);
    requestCounted = true;
    req.signal.addEventListener("abort", () => {
      // The provider receives this signal below; this listener also makes the
      // request lifecycle explicit for runtimes that keep route promises alive.
    }, { once: true });
    const cleanMsg = trimmedMsg.toLowerCase();
    const isSuperAdmin = session.role === "superadmin" || session.isOwner === true;
    const isAdmin = session.role === "admin" || isSuperAdmin;

    // ── SUPERADMIN MASTER AI COMMANDS & GLOBAL CONTROLS ─────────────────────
    if (isSuperAdmin) {
      // 1. Superadmin Access & Capabilities Discovery
      const isAccessInquiry =
        cleanMsg.includes("صلاحيات") ||
        cleanMsg.includes("access") ||
        cleanMsg.includes("powers") ||
        cleanMsg.includes("تقدر تعمل ايه") ||
        cleanMsg.includes("تقدر تعمل إيه") ||
        cleanMsg.includes("أوامرك") ||
        cleanMsg.includes("اوامرك") ||
        cleanMsg.includes("الاوامر") ||
        cleanMsg.includes("الأوامر") ||
        cleanMsg === "help" ||
        cleanMsg === "superadmin" ||
        cleanMsg === "admin";

      if (isAccessInquiry) {
        const { ConfigManager } = await import("@/ai/config/AIConfig");
        const currentPrimary = ConfigManager.getInstance().getConfig().primaryProvider;

        let activeName = "Google Gemini Pool (Primary)";
        if (currentPrimary === "digitalocean") activeName = "DigitalOcean Premium (Llama-3.3-70B)";
        else if (currentPrimary === "deepseek" || currentPrimary === "deepseek_v4_flash") activeName = "DeepSeek V4 Flash";
        else if (currentPrimary === "mock") activeName = "Mock Provider (Local)";

        const accessBriefing =
          `👑 **لوحة تحكم وصلاحيات المشرف العام (Superadmin Master Access Control)**\n\n` +
          `أهلاً بك يا فندم! بصفتك **المشرف العام (Superadmin)**، لديك الصلاحيات الكاملة للتحكم في كافة محركات ومنظومات الذكاء الاصطناعي على منصة Code-UP مباشرة عبر المحادثة:\n\n` +
          `━━━━━━━━━━━━━━━━\n\n` +
          `🌐 **1. التبديل الفوري لنموذج الذكاء الاصطناعي العام لجميع الطلاب (Global Model Switcher)**:\n` +
          `• النموذج النشط حالياً لجميع الطلاب: \`${activeName}\`\n` +
          `• يمكنك تغيير المحرك العام لكل طلاب المنصة في أي لحظة بمجرد كتابة أي من الأوامر التالية:\n` +
          `  - 🔵 *"شغّل ديب سيك للطلاب"* أو \`switch to deepseek\` (لتفعيل DeepSeek V4 Flash)\n` +
          `  - 🟢 *"شغّل جيميني للطلاب"* أو \`switch to gemini\` (لتفعيل Google Gemini Pool)\n` +
          `  - ⚡ *"شغّل ديجيتال أوشن للطلاب"* أو \`switch to digitalocean\` (لتفعيل Llama-3.3-70B)\n` +
          `  - 🟡 *"شغّل mock للطلاب"* أو \`switch to mock\` (للنموذج المحلي التجريبي)\n\n` +
          `📊 **2. إحصائيات الاستهلاك والتكاليف الفورية (Live Telemetry & Costs)**:\n` +
          `• اكتب \`Ahmed123M\` أو \`stats\` لعرض تقرير فوري بعدد الطلاب، عدد الرسائل، التكلفة بالدولار، وسرعة الردود.\n\n` +
          `🏆 **3. التحكم في لوحة الشرف 24H والجوائز (Daily Leaderboard Control)**:\n` +
          `• التحكم الكامل في جوائز المراكز الـ 10 وإعادة احتساب الكاش اليومي عند 3:00 ص بتوقيت القاهرة.\n\n` +
          `🛡️ **4. جدار الحماية والأمان للطلاب (AI Firewall & Moderation)**:\n` +
          `• حماية ضد محاولات الاختراق، فلترة الرسائل، والتحكم في الشكاوى وطلبات تعديل الدرجات.\n\n` +
          `⚙️ **5. أنماط الأداء الفائقة (Execution Modes)**:\n` +
          `• \`AhmedToldMeSotalkelse\` : تفعيل وضع المطور المباشر وقائمة النماذج.\n` +
          `• \`AhmedProMode\` : تفعيل الوضع المهني الرسمي.\n` +
          `• \`AhmedFastMode\` : وضع الاستجابة فائقة السرعة.\n` +
          `• \`AhmedReset\` : مسح سجل المحادثات والذاكرة.\n\n` +
          `💡 *أنا جاهز لتنفيذ أي أمر تريده الآن!*`;

        return NextResponse.json({
          message: accessBriefing,
          actions: [],
          source: "superadmin_access",
        });
      }

      // 2. Conversational Global Model Switching for All Students
      const isSwitchIntent =
        cleanMsg.includes("غير") ||
        cleanMsg.includes("حول") ||
        cleanMsg.includes("خل") ||
        cleanMsg.includes("شغل") ||
        cleanMsg.includes("شغّل") ||
        cleanMsg.includes("استخدم") ||
        cleanMsg.includes("switch") ||
        cleanMsg.includes("use") ||
        cleanMsg.includes("set") ||
        cleanMsg.includes("talk") ||
        cleanMsg.includes("طالب") ||
        cleanMsg.includes("طلاب") ||
        cleanMsg.includes("student") ||
        cleanMsg.includes("النموذج") ||
        cleanMsg.includes("model");

      const wantsDeepSeek = cleanMsg.includes("deepseek") || cleanMsg.includes("ديب سيك") || cleanMsg.includes("ديبسيك");
      const wantsGemini = cleanMsg.includes("gemini") || cleanMsg.includes("جيميني") || cleanMsg.includes("جيمينى") || cleanMsg.includes("جوجل");
      const wantsDO = cleanMsg.includes("digitalocean") || cleanMsg.includes("ديجيتال") || cleanMsg.includes("llama") || cleanMsg.includes("codeup");
      const wantsMock = cleanMsg.includes("mock") || cleanMsg.includes("محاكي") || cleanMsg.includes("تجريبي");

      if (isSwitchIntent && (wantsDeepSeek || wantsGemini || wantsDO || wantsMock)) {
        const { ConfigManager } = await import("@/ai/config/AIConfig");
        const configMgr = ConfigManager.getInstance();

        let targetSlug = "gemini";
        let targetTitle = "Google Gemini Pool (Primary)";
        let targetDesc = "محرك جوجل السريع والمخصص للشرح الأكاديمي والتحليل الذكي.";

        if (wantsDeepSeek) {
          targetSlug = "deepseek";
          targetTitle = "DeepSeek V4 Flash";
          targetDesc = "محرك DeepSeek عالي الدقة وسريع البديهة في البرمجة والحلول المعقدة.";
        } else if (wantsDO) {
          targetSlug = "digitalocean";
          targetTitle = "Code-UP Platform Assistant (DigitalOcean Premium Llama-3.3-70B)";
          targetDesc = "نموذج Llama-3.3 المتميز المستضاف على DigitalOcean عالي الأداء.";
        } else if (wantsMock) {
          targetSlug = "mock";
          targetTitle = "Mock Local Provider (Local Test)";
          targetDesc = "النموذج المحلي التجريبي السريع لاختبار النظام.";
        }

        // Apply globally to runtime config
        configMgr.updateConfig({ primaryProvider: targetSlug });

        // Update database AIProvider records if existing
        try {
          await prisma.aIProvider.updateMany({
            data: { isPrimary: false },
          });
          await prisma.aIProvider.updateMany({
            where: { slug: targetSlug },
            data: { isPrimary: true, isActive: true },
          });
        } catch {
          // In-memory update took effect
        }

        const confirmText =
          `👑 **تم تنفيذ أمر المشرف العام بنجاح! (Global AI Model Updated)**\n\n` +
          `🌐 **النموذج النشط العام للطلاب الآن**: \`${targetTitle}\`\n` +
          `📝 **الوصف**: ${targetDesc}\n\n` +
          `⚡ **حالة المنصة**: تم تحويل جميع محادثات الطلاب والوكيل الذكي عبر المنصة فوراً للتحدث والتفاعل باستخدام **${targetTitle}**.\n\n` +
          `💡 *يمكنك في أي وقت كتابة "صلاحيات" للاطلاع على كامل أدوات التحكم أو تغيير النموذج مجدداً.*`;

        return NextResponse.json({
          message: confirmText,
          actions: [],
          source: "superadmin_model_switch",
        });
      }

      // 3. Superadmin Course Management & Fast Overrides (كورس كذا خليه كذا)
      const isCourseCommand =
        (cleanMsg.includes("كورس") || cleanMsg.includes("الكورس") || cleanMsg.includes("حصة") || cleanMsg.includes("حصه") || cleanMsg.includes("شهر")) &&
        (cleanMsg.includes("خليه") ||
          cleanMsg.includes("خلي") ||
          cleanMsg.includes("خلّي") ||
          cleanMsg.includes("غير") ||
          cleanMsg.includes("غيّر") ||
          cleanMsg.includes("حول") ||
          cleanMsg.includes("حوّل") ||
          cleanMsg.includes("سعره") ||
          cleanMsg.includes("سعر") ||
          cleanMsg.includes("مجاني") ||
          cleanMsg.includes("مدفوع") ||
          cleanMsg.includes("تأسيسي") ||
          cleanMsg.includes("تاسيسي"));

      if (isCourseCommand) {
        const allCourses = await prisma.course.findMany({
          select: { id: true, title: true, price: true, isPaid: true, teacher: { select: { name: true } } },
        });

        // Find best matching course
        let bestCourse: (typeof allCourses)[0] | null = null;
        let highestScore = 0;

        const normalizedMsg = cleanMsg
          .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        for (const c of allCourses) {
          const courseTitleNorm = c.title
            .toLowerCase()
            .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim();

          // Direct containment of full course title
          if (normalizedMsg.includes(courseTitleNorm)) {
            bestCourse = c;
            highestScore = 1000 + courseTitleNorm.length;
            break;
          }

          // Word-by-word token matching
          const tokens = courseTitleNorm.split(" ").filter((t) => t.length > 1);
          let matchCount = 0;
          for (const t of tokens) {
            if (normalizedMsg.includes(t)) {
              matchCount++;
            }
          }

          if (matchCount > 0 && matchCount >= tokens.length * 0.5) {
            const score = matchCount * 10 - tokens.length;
            if (score > highestScore) {
              highestScore = score;
              bestCourse = c;
            }
          }
        }

        if (bestCourse) {
          const updates: Record<string, unknown> = {};
          const changesText: string[] = [];

          // 1. Paid / Free
          if (cleanMsg.includes("مجاني") || cleanMsg.includes("ببلاش") || cleanMsg.includes("free")) {
            updates.isPaid = false;
            updates.price = 0;
            changesText.push("تحويل الكورس إلى **مجاني (0 ج.م)**");
          } else if (cleanMsg.includes("مدفوع") || cleanMsg.includes("paid")) {
            updates.isPaid = true;
            changesText.push("تحويل الكورس إلى **مدفوع**");
          }

          // 2. Price
          const priceMatch = cleanMsg.match(/(?:سعر(?:ه)?|بـ|خليه|خلّي|خلي)\s*(\d+)/) || cleanMsg.match(/(\d+)\s*(?:جنيه|ج\.م|ج|egp|le)/);
          if (priceMatch && priceMatch[1]) {
            const newPrice = parseFloat(priceMatch[1]);
            if (!isNaN(newPrice)) {
              updates.price = newPrice;
              if (newPrice > 0) updates.isPaid = true;
              changesText.push(`تحديد السعر: **${newPrice} ج.م**`);
            }
          }

          // 3. Category classification override
          let targetCategory: string | null = null;
          if (cleanMsg.includes("تأسيس") || cleanMsg.includes("تاسيس")) {
            targetCategory = "foundation";
            changesText.push("تصنيف الكورس: **كورس تأسيسي**");
          } else if (cleanMsg.includes("حصة") || cleanMsg.includes("حصه") || cleanMsg.includes("ورشة") || cleanMsg.includes("ورشه")) {
            targetCategory = "lesson";
            changesText.push("تصنيف الكورس: **حصة / ورشة أولى**");
          } else if (cleanMsg.includes("شهر") || cleanMsg.includes("الشهور")) {
            targetCategory = "month";
            changesText.push("تصنيف الكورس: **كورس شهري**");
          } else if (cleanMsg.includes("تلقائي") || cleanMsg.includes("افتراضي") || cleanMsg.includes("عادي")) {
            targetCategory = "auto";
            changesText.push("إعادة التصنيف إلى: **الوضع التلقائي الافتراضي**");
          }

          if (Object.keys(updates).length > 0) {
            await prisma.course.update({
              where: { id: bestCourse.id },
              data: updates,
            });
          }

          if (targetCategory) {
            if (targetCategory === "auto") {
              await prisma.appSetting.delete({
                where: { key: `course_cat_${bestCourse.id}` },
              }).catch(() => {});
            } else {
              await prisma.appSetting.upsert({
                where: { key: `course_cat_${bestCourse.id}` },
                update: { value: targetCategory },
                create: { key: `course_cat_${bestCourse.id}`, value: targetCategory },
              });
            }
          }

          if (changesText.length > 0) {
            const { invalidateStudentContextCache } = await import("@/lib/ai-context");
            invalidateStudentContextCache(session.id);

            const reply =
              `👑 **تم تنفيذ أمر المشرف العام بنجاح فوري! (Superadmin Course Updated)**\n\n` +
              `📚 **الكورس:** "${bestCourse.title}"\n` +
              `👨‍🏫 **المدرس:** ${bestCourse.teacher.name}\n\n` +
              `⚙️ **التعديلات المنفذة:**\n` +
              changesText.map((c) => `• ${c}`).join("\n") +
              `\n\n✨ تم تطبيق التغييرات فوراً على المنصة وصفحة المدرس وفلاتر الترتيب!`;

            return NextResponse.json({
              message: reply,
              actions: [
                {
                  type: "update_course",
                  status: "updated",
                  id: bestCourse.id,
                },
              ],
              source: "superadmin_course_control",
            });
          }
        }
      }
    }

    // ── STRICT ADMIN-ONLY CHEAT CODES & DEVELOPER TOOLS ──────────────────────
    if (isAdmin) {
      // Check if the previous message in conversation history was the developer menu
      const lastAssistantMsg = await prisma.aIConversation.findFirst({
        where: { studentId: session.id, role: "assistant" },
        orderBy: { createdAt: "desc" },
        select: { content: true },
      }).catch(() => null);
      const isAfterDevMenu = lastAssistantMsg?.content?.includes("[م:dev_menu]") || lastAssistantMsg?.content?.includes("Secret AI Model Switcher");

      // 1. Ahmed123M / Admin123 / stats command check for live AI statistics & model telemetry (ADMIN ONLY)
      if (cleanMsg === "ahmed123m" || cleanMsg === "admin123" || cleanMsg === "stats") {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const todayConversations = await prisma.aIConversation.findMany({
          where: { createdAt: { gte: startOfToday } },
          select: { studentId: true },
        });
        const uniqueUsersToday = new Set(todayConversations.map((c) => c.studentId)).size;
        const totalMessagesToday = todayConversations.length;

        const { CostManager } = await import("@/ai/admin/cost_analytics/CostManager");
        const { Telemetry } = await import("@/ai/telemetry/Telemetry");
        const { ConfigManager } = await import("@/ai/config/AIConfig");

        const costMgr = CostManager.getInstance();
        const telemetry = Telemetry.getInstance();
        const config = ConfigManager.getInstance().getConfig();

        const metrics = telemetry.getMetrics();
        const providerCosts = costMgr.getCostByProvider();
        const totalCostUsd = costMgr.getTotalCostUsd();

        let activeModel = config.primaryProvider;
        if (config.primaryProvider === "digitalocean") {
          activeModel = "Code-UP Platform Assistant (DigitalOcean Premium)";
        } else if (config.primaryProvider === "gemini") {
          activeModel = "Google Gemini Pool (Primary)";
        } else if (config.primaryProvider === "deepseek" || config.primaryProvider === "deepseek_v4_flash") {
          activeModel = "DeepSeek V4 Flash";
        }

        const geminiRequests = metrics.requestsByProvider["gemini"] || 0;
        const geminiCost = providerCosts["gemini"] || 0;

        const doRequests = metrics.requestsByProvider["digitalocean"] || 0;
        const doCost = providerCosts["digitalocean"] || 0;

        const deepseekRequests = (metrics.requestsByProvider["deepseek_v4_flash"] || 0) + (metrics.requestsByProvider["deepseek"] || 0);
        const deepseekCost = (providerCosts["deepseek_v4_flash"] || 0) + (providerCosts["deepseek"] || 0);

        const mockRequests = metrics.requestsByProvider["mock"] || 0;

        const statsText = `📊 **تقرير الإحصائيات الفوري للنظام (Ahmed123M Live Stats)**\n\n` +
          `🤖 **النموذج المتحدث الحالي (Talking Model)**: \`${activeModel}\`\n` +
          `🔄 **سلسلة التراجع التلقائي (Fallback Chain)**: \`DigitalOcean ➔ Gemini Pool ➔ Mock ➔ DeepSeek V4 Flash\`\n` +
          `👥 **عدد مستخدمي الذكاء الاصطناعي اليوم (Users Today)**: ${uniqueUsersToday} مستخدم\n` +
          `💬 **إجمالي رسائل المحادثة اليوم (Messages Today)**: ${totalMessagesToday} رسالة\n\n` +
          `━━━━━━━━━━━━━━━━\n\n` +
          `💸 **تكاليف واستخدام المزودين (Today's Provider Costs & Usage)**:\n` +
          `• 💰 **إجمالي التكلفة اليومية الكلية**: \`$${totalCostUsd.toFixed(6)} USD\`\n` +
          `• ⚡ **DigitalOcean Premium**: ${doRequests} طلبات | تكلفة: \`$${doCost.toFixed(6)} USD\`\n` +
          `• 🟢 **Google Gemini Pool**: ${geminiRequests} طلبات | تكلفة: \`$${geminiCost.toFixed(6)} USD\`\n` +
          `• 🟡 **Mock Provider (Local)**: ${mockRequests} طلبات | تكلفة: \`$0.00 USD\` (مجاني محلي)\n` +
          `• 🔵 **DeepSeek V4 Flash**: ${deepseekRequests} طلبات | تكلفة: \`$${deepseekCost.toFixed(6)} USD\` (احتياطي دائم)\n\n` +
          `━━━━━━━━━━━━━━━━\n\n` +
          `🛡️ **حالة الميزانية والأمان (Budget & Safety Limits)**:\n` +
          `• 📊 **الاستهلاك والميزانية**: \`$${totalCostUsd.toFixed(4)} USD / ∞ غير محدود (يعمل حتى نفاد رصيد الـ API)\`\n` +
          `• ⚡ **إجمالي التوكنز المستهلكة**: ${metrics.totalTokensUsed} tokens\n` +
          `• ⏳ **متوسط سرعة الاستجابة**: ${Math.round(metrics.averageLatencyMs)} ms\n` +
          `• ⚙️ **حد حفظ المحادثة الأقصى**: 15 رسالة فقط`;

        return NextResponse.json({
          message: statsText,
          actions: [],
          source: "admin_stats",
        });
      }

      // 2. Secret password to unlock Developer Mode & Model Switcher: AhmedToldMeSotalkelse (ADMIN ONLY)
      const isDevSecretTrigger = cleanMsg.includes("ahmedtoldmesotalkelse") || cleanMsg === "dev" || cleanMsg === "developer";
      const isModelSwitchFollowUp = isAfterDevMenu && ["1", "2", "3", "4", "do", "gemini", "deepseek", "mock", "digitalocean"].includes(cleanMsg);

      if (isDevSecretTrigger || isModelSwitchFollowUp) {
        const { ConfigManager } = await import("@/ai/config/AIConfig");
        const configMgr = ConfigManager.getInstance();

        let arg = cleanMsg.replace("ahmedtoldmesotalkelse", "").replace("developer", "").replace("dev", "").trim();
        if (isModelSwitchFollowUp) arg = cleanMsg;

        if (arg === "1" || arg === "do" || arg === "digitalocean" || arg === "codeup") {
          configMgr.updateConfig({ primaryProvider: "digitalocean" });
          const switchText = `👨‍💻 **تم تفعيل وضع المطور + تحويل النموذج إلى 1!**\n\n` +
            `🤖 **النموذج المتحدث**: \`Code-UP Platform Assistant (DigitalOcean Premium Llama-3.3-70B)\`\n` +
            `⚡ **وضع المطور**: لن يتم التعامل معك كطالب، ولن يكون هناك أي شرح أو تعليم غير مطلوب. استجابات سريعة ومباشرة للمطور.`;
          return NextResponse.json({
            message: switchText,
            actions: [],
            source: "developer_mode",
          });
        } else if (arg === "2" || arg === "gemini") {
          configMgr.updateConfig({ primaryProvider: "gemini" });
          return NextResponse.json({
            message: "👨‍💻 **تم تفعيل وضع المطور + تحويل النموذج إلى Google Gemini Pool (Primary)**",
            actions: [],
            source: "developer_mode",
          });
        } else if (arg === "3" || arg === "deepseek") {
          configMgr.updateConfig({ primaryProvider: "deepseek" });
          return NextResponse.json({
            message: "👨‍💻 **تم تفعيل وضع المطور + تحويل النموذج إلى DeepSeek V4 Flash**",
            actions: [],
            source: "developer_mode",
          });
        } else if (arg === "4" || arg === "mock") {
          configMgr.updateConfig({ primaryProvider: "mock" });
          return NextResponse.json({
            message: "👨‍💻 **تم تفعيل وضع المطور + تحويل النموذج إلى Mock Provider (Local Test)**",
            actions: [],
            source: "developer_mode",
          });
        } else {
          const menuText = `👨‍💻 **تم تفعيل وضع المطور المباشر (Developer / Admin Mode Activated)**\n\n` +
            `أهلاً يا باشمهندس! تم تحويل النظام للتعامل معك كـ **Platform Developer** وليس كطالب:\n` +
            `• ❌ إلغاء الشرح والتعليم التلقائي غير المطلوب\n` +
            `• ⚡ استجابة فورية ومباشرة للأوامر البرمجية والمنصة\n` +
            `• 🗑️ مسح المحادثات السابقة عند الحاجة بكلمة \`AhmedReset\`\n\n` +
            `🤖 **اختيار النموذج بـ 1-4 (Secret AI Model Switcher)**:\n` +
            `1️⃣ **DigitalOcean Premium Model** (Llama-3.3-70B)\n` +
            `2️⃣ **Google Gemini Pool** (Primary)\n` +
            `3️⃣ **DeepSeek V4 Flash** (Fast Backup)\n` +
            `4️⃣ **Mock Provider** (Local Test)\n\n` +
            `💡 *للتحويل المباشر اكتب الرقم:* \`1\` أو \`2\` أو \`3\` أو \`4\`\n\n[م:dev_menu]`;
          return NextResponse.json({
            message: menuText,
            actions: [],
            source: "developer_mode",
          });
        }
      }

      // 3. Secret password for Professional Mode: AhmedProMode / professional / pro (ADMIN ONLY)
      if (cleanMsg === "ahmedpromode" || cleanMsg === "professional" || cleanMsg === "pro") {
        return NextResponse.json({
          message: "👔 **تم تفعيل الوضع المهني المتقدم (Professional Mode)**\n\nسيتحدث الوكيل بأسلوب عملي، رسمي، ومباشر دون مقدمات إضافية.\n\n[م:pro_mode]",
          actions: [],
          source: "pro_mode",
        });
      }

      // 4. Secret password for Fast Response Mode: AhmedFastMode / fast / speed (ADMIN ONLY)
      if (cleanMsg === "ahmedfastmode" || cleanMsg === "fast" || cleanMsg === "speed") {
        return NextResponse.json({
          message: "⚡ **تم تفعيل وضع الاستجابة الفائقة (Fast Latency Mode)**\n\nإجابات موجزة في نقاط سريعة بأقل زحام في الكلمات.\n\n[م:fast_mode]",
          actions: [],
          source: "fast_mode",
        });
      }
    }

    // ── Command to purge/delete own chat history (Available for any user) ─────
    if (cleanMsg === "ahmedreset" || cleanMsg === "clear" || cleanMsg === "delete") {
      await prisma.aIConversation.deleteMany({
        where: { studentId: session.id },
      });
      const { MemoryManager } = await import("@/ai/memory/MemoryManager");
      MemoryManager.getInstance().clearSession(session.id);

      return NextResponse.json({
        message: "🗑️ **تم مسح جميع الرسائل والمحادثات السابقة والحالية بنجاح!**\n\nتم إعادة ضبط السجل بالكامل.",
        actions: [],
        source: "chat_cleared",
      });
    }

    // Parallelize pre-flight context & history queries (<15ms)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [context, history, notifData] = await Promise.all([
      buildStudentContext(session.id).catch((ctxErr) => {
        console.error("[chat/route] buildStudentContext failed:", ctxErr);
        return {
          profile: {
            id: session.id,
            name: session.name || "الطالب",
            email: session.email || "",
            age: null,
            educationalStage: null,
            phone: null,
            role: session.role,
          },
          courses: [],
          overallStats: { totalCourses: 0, averageScore: 0, totalQuizzesTaken: 0, totalVideosWatched: 0 },
          weakAreas: [],
          aiInsights: [],
          recentFeedback: [],
          libraryProgress: [],
        };
      }),
      prisma.aIConversation.findMany({
        where: { studentId: session.id },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, role: true, content: true },
      }).catch(() => []),
      Promise.all([
        prisma.gradeAdjustmentRequest.findMany({
          where: { studentId: session.id, status: { in: ["approved", "rejected"] }, reviewedAt: { gte: sevenDaysAgo } },
          include: { quiz: { select: { title: true } } },
          orderBy: { reviewedAt: "desc" },
          take: 2,
        }).catch(() => []),
        prisma.supportTicket.findMany({
          where: { studentId: session.id, status: { in: ["resolved", "closed"] }, updatedAt: { gte: sevenDaysAgo } },
          orderBy: { updatedAt: "desc" },
          take: 2,
        }).catch(() => []),
      ]).catch(() => [[], []]),
      // Non-blocking fire-and-forget save of user message
      prisma.aIConversation.create({
        data: {
          studentId: session.id,
          role: "user",
          content: message,
        },
      }).catch(() => null),
    ]);

    const chatHistory: ChatMessage[] = history
      .reverse()
      .map((h) => ({
        role: h.role as ChatMessage["role"],
        content: h.content,
      }));

    // Build notifications
    const notifItems: string[] = [];
    const [recentGrades, recentTickets] = (notifData || [[], []]) as [any[], any[]];
    for (const r of recentGrades) {
      notifItems.push(`تعديل درجة "${r.quiz?.title || "كويز"}": ${r.status === "approved" ? "مقبول ✅" : "مرفوض ❌"}${r.teacherNotes ? ` - ${r.teacherNotes}` : ""}`);
    }
    for (const t of recentTickets) {
      notifItems.push(`"${t.title}": ${t.status === "resolved" ? "تم الحل ✅" : "مغلق"}${t.resolution ? ` - ${t.resolution}` : ""}`);
    }

    const notifications = notifItems.length > 0 ? `تحديثات طلباتك:\n${notifItems.map((n) => `• ${n}`).join("\n")}` : undefined;

    // Get AI response — runs Gemini directly
    let result;
    try {
      result = await chatWithAI(trimmedMsg, chatHistory, context, notifications, req.signal);
    } catch (chatErr) {
      console.error("[chat/route] chatWithAI threw:", chatErr);
      result = {
        message: "مساعد الذكاء الاصطناعي قيد التحديث والصيانة حالياً، يرجى المحاولة مرة أخرى لاحقاً ⏳",
        actions: [] as AIAction[],
        source: "fallback" as const,
      };
    }

    // Execute AI actions if any
    const executedActions: Array<{ type: string; status: string; id?: string; error?: string }> = [];
    for (const action of result.actions) {
      // Handle status check inline (option 5)
      if (action.type === "show_insights" && (action.payload as Record<string, unknown>)?.checkStatus) {
        const gradeReqs = await prisma.gradeAdjustmentRequest.findMany({
          where: { studentId: session.id },
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { quiz: { select: { title: true } } },
        });
        const ticketReqs = await prisma.supportTicket.findMany({
          where: { studentId: session.id },
          orderBy: { createdAt: "desc" },
          take: 10,
        });
        let statusMsg = "📋 حالة طلباتي:\n\n";
        if (gradeReqs.length === 0 && ticketReqs.length === 0) {
          statusMsg += "مفيش طلبات لسه.\n";
        } else {
          if (gradeReqs.length > 0) {
            statusMsg += "✏️ طلبات تعديل درجة:\n";
            for (const r of gradeReqs) {
              const lbl = r.status === "approved" ? "مقبول ✅" : r.status === "rejected" ? "مرفوض ❌" : "قيد المراجعة ⏳";
              statusMsg += `• ${r.quiz.title}: ${lbl}${r.teacherNotes ? ` (${r.teacherNotes})` : ""}\n`;
            }
            statusMsg += "\n";
          }
          if (ticketReqs.length > 0) {
            statusMsg += "📢 الشكاوى:\n";
            for (const t of ticketReqs) {
              const lbl = t.status === "resolved" ? "تم الحل ✅" : t.status === "closed" ? "مغلق" : t.status === "escalated" ? "تم التصعيد ↑" : "مفتوح ⏳";
              statusMsg += `• ${t.title}: ${lbl}${t.resolution ? ` (${t.resolution})` : ""}\n`;
            }
          }
        }
        statusMsg += "\nاكتب 0 للرجوع\n\n[م:5]";
        result.message = statusMsg;
        executedActions.push({ type: "show_insights", status: "ok" });
        continue;
      }
      const exec = await executeAction(session.id, action);
      executedActions.push(exec);
    }

    // Save assistant response with actions
    await prisma.aIConversation.create({
      data: {
        studentId: session.id,
        role: "assistant",
        content: result.message,
        actions: executedActions.length > 0 ? JSON.stringify(executedActions) : null,
        context: JSON.stringify({
          source: result.source,
          courses: context.courses.length,
          weakAreas: context.weakAreas.length,
        }),
      },
    });

    // Prune old messages: keep only last 15
    const allMessages = await prisma.aIConversation.findMany({
      where: { studentId: session.id },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (allMessages.length > 15) {
      const idsToDelete = allMessages.slice(15).map((m) => m.id);
      await prisma.aIConversation.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }

    return NextResponse.json({
      message: result.message,
      actions: executedActions,
      source: result.source,
    });
  } catch (err) {
    console.error("AI chat error:", err instanceof Error ? err.stack : err);
    return NextResponse.json({
      message: "أهلاً بيك! أنا مرشدك الذكي على Code-UP 🌟\n\nأنا هنا لمساعدتك! اختار خطة تدريبية أو حلل أدائك أو اسألني أي حاجة.",
      actions: [],
      source: "fallback",
    });
  } finally {
    if (requestCounted && requestSessionId) {
      const remaining = (activeAiRequests.get(requestSessionId) ?? 1) - 1;
      if (remaining > 0) activeAiRequests.set(requestSessionId, remaining);
      else activeAiRequests.delete(requestSessionId);
    }
  }
}

export async function GET() {
  try {
    const session = await getStudentSession() ?? await getSession();
    if (!session) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const history = await prisma.aIConversation.findMany({
      where: { studentId: session.id },
      orderBy: { createdAt: "asc" },
      take: 15,
      select: {
        id: true,
        role: true,
        content: true,
        actions: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ messages: history });
  } catch (err) {
    console.error("AI chat history error:", err);
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const session = await getStudentSession() ?? await getSession();
    if (!session) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    await prisma.aIConversation.deleteMany({
      where: { studentId: session.id },
    });

    const { MemoryManager } = await import("@/ai/memory/MemoryManager");
    MemoryManager.getInstance().clearSession(session.id);

    return NextResponse.json({ success: true, message: "تم مسح المحادثة وحذف السجل بالكامل" });
  } catch (err) {
    console.error("Delete conversation error:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء مسح المحادثة" }, { status: 500 });
  }
}

async function executeAction(
  studentId: string,
  action: AIAction
): Promise<{ type: string; status: string; id?: string; error?: string; path?: string; reason?: string; payload?: unknown }> {
  try {
    switch (action.type) {
      case "update_course": {
        const p = action.payload as {
          courseId?: string;
          category?: string;
          isPaid?: boolean;
          price?: number;
          title?: string;
        };
        if (!p?.courseId) {
          return { type: action.type, status: "failed", error: "معرف الكورس مطلوب" };
        }

        const course = await prisma.course.findUnique({
          where: { id: p.courseId },
          select: { id: true, title: true },
        });
        if (!course) {
          return { type: action.type, status: "failed", error: "الكورس غير موجود" };
        }

        const dataToUpdate: Record<string, unknown> = {};
        if (typeof p.isPaid === "boolean") {
          dataToUpdate.isPaid = p.isPaid;
          if (!p.isPaid) {
            dataToUpdate.price = 0;
          }
        }
        if (typeof p.price === "number") {
          dataToUpdate.price = p.price;
          if (p.price > 0) {
            dataToUpdate.isPaid = true;
          }
        }
        if (typeof p.title === "string" && p.title.trim()) {
          dataToUpdate.title = p.title.trim();
        }

        if (Object.keys(dataToUpdate).length > 0) {
          await prisma.course.update({
            where: { id: p.courseId },
            data: dataToUpdate,
          });
        }

        if (p.category) {
          const cat = p.category.toLowerCase().trim();
          if (cat === "auto" || cat === "none" || cat === "reset") {
            await prisma.appSetting.delete({
              where: { key: `course_cat_${p.courseId}` },
            }).catch(() => {});
          } else {
            await prisma.appSetting.upsert({
              where: { key: `course_cat_${p.courseId}` },
              update: { value: cat },
              create: { key: `course_cat_${p.courseId}`, value: cat },
            });
          }
        }

        const { invalidateStudentContextCache } = await import("@/lib/ai-context");
        invalidateStudentContextCache(studentId);

        return { type: action.type, status: "updated", id: p.courseId };
      }

      case "create_grade_request": {
        const p = action.payload as {
          quizId: string;
          reason: string;
          requestedScore?: number;
          evidence?: string;
        };
        if (!p?.quizId || !p?.reason) {
          return { type: action.type, status: "failed", error: "بيانات ناقصة" };
        }

        const result = await prisma.quizResult.findFirst({
          where: { quizId: p.quizId, studentId },
          include: {
            quiz: {
              include: {
                folder: { select: { courseId: true } },
              },
            },
          },
        });

        if (!result) {
          return { type: action.type, status: "failed", error: "لم يتم حل هذا الكويز" };
        }

        let aiAnalysis = "تم إنشاء الطلب بواسطة المساعد الذكي بناءً على شكوى المتعلم";
        if (p.evidence) {
          try {
            const ctx = JSON.parse(p.evidence) as { chatHistory?: string; studentInfo?: string };
            const parts = [aiAnalysis];
            if (ctx.studentInfo) parts.push(`\n\n📋 بيانات المتعلم:\n${ctx.studentInfo}`);
            if (ctx.chatHistory) parts.push(`\n\n💬 سجل المحادثة:\n${ctx.chatHistory}`);
            aiAnalysis = parts.join("");
          } catch { /* keep default */ }
        }

        const req = await prisma.gradeAdjustmentRequest.create({
          data: {
            studentId,
            quizId: p.quizId,
            courseId: result.quiz.folder?.courseId ?? "plan",
            requestedBy: "student",
            currentScore: result.score,
            requestedScore: p.requestedScore ?? null,
            reason: p.reason,
            aiAnalysis,
            evidence: p.evidence ?? null,
            status: "pending",
          },
        });

        return { type: action.type, status: "created", id: req.id };
      }

      case "create_ticket": {
        const p = action.payload as {
          title: string;
          description: string;
          type: string;
          priority?: string;
          courseId?: string;
          chatHistory?: string;
          studentInfo?: string;
        };
        if (!p?.title || !p?.description) {
          return { type: action.type, status: "failed", error: "بيانات ناقصة" };
        }

        if (p.courseId) {
          const { checkCourseEnrollment } = await import("@/lib/authorization");
          const isEnrolled = await checkCourseEnrollment(studentId, p.courseId);
          if (!isEnrolled) {
            return { type: action.type, status: "failed", error: "غير مسجل في هذا الكورس" };
          }
        }

        let aiResponse: string | null = null;
        if (p.chatHistory || p.studentInfo) {
          const parts: string[] = [];
          if (p.studentInfo) parts.push(`📋 بيانات المتعلم:\n${p.studentInfo}`);
          if (p.chatHistory) parts.push(`💬 سجل المحادثة:\n${p.chatHistory}`);
          aiResponse = parts.join("\n\n");
        }

        const ticket = await prisma.supportTicket.create({
          data: {
            studentId,
            courseId: p.courseId ?? null,
            title: p.title,
            description: p.description,
            type: p.type || "complaint",
            priority: p.priority || "normal",
            aiHandled: true,
            aiResponse,
            status: "open",
          },
        });

        return { type: action.type, status: "created", id: ticket.id };
      }

      case "submit_feedback": {
        const p = action.payload as {
          courseId: string;
          type: string;
          content: string;
          rating?: number;
        };
        if (!p?.courseId || !p?.content) {
          return { type: action.type, status: "failed", error: "بيانات ناقصة" };
        }

        const { checkCourseEnrollment } = await import("@/lib/authorization");
        const isEnrolled = await checkCourseEnrollment(studentId, p.courseId);
        if (!isEnrolled) {
          return { type: action.type, status: "failed", error: "غير مسجل في هذا الكورس" };
        }

        const course = await prisma.course.findUnique({
          where: { id: p.courseId },
          select: { teacherId: true },
        });
        if (!course) {
          return { type: action.type, status: "failed", error: "الكورس غير موجود" };
        }

        const fb = await prisma.studentFeedback.create({
          data: {
            studentId,
            courseId: p.courseId,
            teacherId: course.teacherId,
            type: p.type || "other",
            content: p.content,
            rating: p.rating ?? null,
            aiAnalyzed: true,
          },
        });

        return { type: action.type, status: "created", id: fb.id };
      }

      case "navigate": {
        const p = action.payload as { path?: string; reason?: string } | undefined;
        return {
          type: "navigate",
          status: "navigate",
          path: p?.path || (action as any)?.path || "",
          reason: p?.reason || (action as any)?.reason || "انتقال فوري",
          payload: action.payload,
        };
      }

      case "interactive_question":
      case "show_insights":
      case "none":
        return { type: action.type, status: "ok", payload: action.payload };

      default:
        return { type: "unknown", status: "ignored" };
    }
  } catch (err) {
    console.error("Action execution error:", err);
    return {
      type: action.type,
      status: "failed",
      error: err instanceof Error ? err.message : "خطأ غير معروف",
    };
  }
}
