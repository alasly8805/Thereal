import type { Metadata } from "next";
import Link from "next/link";
import {
  ShieldCheck,
  Database,
  Share2,
  Cookie,
  Smartphone,
  Users,
  Clock,
  UserRoundCog,
  Lock,
  Mail,
} from "lucide-react";
import { LegalCallout, LegalPage, LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "سياسة الخصوصية | منصة Code-UP",
  description:
    "كيف تجمع منصة Code-UP بيانات الطلاب وأولياء الأمور وتستخدمها وتحميها، وما حقوقك في الاطلاع أو التصحيح أو الحذف.",
  alternates: { canonical: "https://code-up.tech/privacy" },
  openGraph: {
    title: "سياسة الخصوصية — منصة Code-UP",
    description: "شفافية حول بيانات الحساب، ولي الأمر، الدفع، وملفات الارتباط على كود اب.",
    url: "https://code-up.tech/privacy",
    siteName: "منصة Code-UP",
    locale: "ar_EG",
    type: "article",
  },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      badge={
        <>
          <ShieldCheck className="w-4 h-4 text-sky-400" />
          <span>حماية البيانات والخصوصية</span>
        </>
      }
      title="سياسة الخصوصية"
      intro="توضح هذه السياسة البيانات التي نجمعها على منصة Code-UP، ولماذا نجمعها، ومع من نشاركها، وكيف يمكنك التحكم فيها. بالمتابعة أو بإنشاء الحساب فإنك توافق على هذه السياسة."
      updated="٢٠ سبتمبر ٢٠٢٦"
      siblingHref="/terms"
      siblingLabel="اقرأ أيضًا: الشروط والأحكام"
    >
      <LegalSection
        icon={<ShieldCheck className="w-4 h-4" />}
        iconClass="bg-sky-500/15 text-sky-400 border-sky-500/30"
        title="أولًا: من نحن"
      >
        <p>
          منصة <strong className="text-white">Code-UP (كود اب)</strong> منصة تعليم إلكتروني مصرية خاصة على{" "}
          <a href="https://code-up.tech" className="text-sky-400 underline underline-offset-2">
            code-up.tech
          </a>
          ، لشرح مادة البرمجة والذكاء الاصطناعي لطلاب البكالوريا والثانوية العامة. لسنا منصة وزارة التربية والتعليم، ولسنا بديلًا لحساب الطالب على كيريو.
        </p>
        <p>
          نلتزم بحماية بياناتك وفق قانون حماية البيانات الشخصية المصري رقم ١٥١ لسنة ٢٠٢٠، ولا نبيع بيانات الطلاب أو أولياء الأمور لأي طرف مقابل مال.
        </p>
      </LegalSection>

      <LegalSection
        icon={<Database className="w-4 h-4" />}
        iconClass="bg-violet-500/15 text-violet-400 border-violet-500/30"
        title="ثانيًا: البيانات التي نجمعها"
      >
        <p>نجمع فقط ما نحتاجه لتشغيل الحساب وتقديم الخدمة التعليمية:</p>
        <ul className="space-y-2 list-disc list-inside">
          <li>
            <strong className="text-white">بيانات الحساب:</strong> الاسم، رقم هاتف الطالب، رقم هاتف ولي الأمر، السن، المرحلة الدراسية، وكلمة المرور (تُحفظ مشفّرة وليس كنص ظاهر).
          </li>
          <li>
            <strong className="text-white">التحقق من الهاتف:</strong> نرسل رمز تأكيد عبر واتساب أو رسالة نصية عند إنشاء الحساب.
          </li>
          <li>
            <strong className="text-white">النشاط التعليمي:</strong> تقدّم المشاهدة، نتائج الاختبارات والواجبات، محاولات محرر الأكواد، ومحادثات المساعدة داخل المنصة.
          </li>
          <li>
            <strong className="text-white">المدفوعات والرصيد:</strong> عمليات شحن المحفظة، الاشتراكات، والمراجع الصادرة من بوابات الدفع. لا نخزّن رقم البطاقة البنكية الكامل على خوادمنا.
          </li>
          <li>
            <strong className="text-white">بيانات تقنية للأمان:</strong> معرّف الجهاز، نوع المتصفح، عنوان الإنترنت (IP)، ووقت تسجيل الدخول، لمنع مشاركة الحساب وحماية المحتوى.
          </li>
        </ul>
      </LegalSection>

      <LegalSection
        icon={<UserRoundCog className="w-4 h-4" />}
        iconClass="bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
        title="ثالثًا: كيف نستخدم البيانات"
      >
        <ul className="space-y-2 list-disc list-inside">
          <li>إنشاء الحساب وتشغيل الكورسات والاختبارات ومتابعة التقدّم.</li>
          <li>إرسال تقارير حضور ودرجات ونشاط مذاكرة إلى ولي الأمر عبر واتساب، بعد تسجيل رقم ولي الأمر.</li>
          <li>إتمام الشحن والاشتراك، وإظهار الرصيد داخل المحفظة.</li>
          <li>حماية المحتوى من النسخ أو مشاركة الحساب على أجهزة غير مصرّح بها.</li>
          <li>الرد على طلبات الدعم وتحسين استقرار المنصة.</li>
        </ul>
        <p className="text-slate-400 text-xs">
          لا نستخدم بيانات الحساب لإعلانات موجّهة بالاسم أو رقم الهاتف. قياس الإعلانات — إن وُجد — يتم كما هو موضّح في بند ملفات الارتباط أدناه.
        </p>
      </LegalSection>

      <LegalSection
        icon={<Share2 className="w-4 h-4" />}
        iconClass="bg-amber-500/15 text-amber-400 border-amber-500/30"
        title="رابعًا: مع من نشارك البيانات"
      >
        <p>لا ننشر بياناتك للعامة. نشارك الحد الأدنى اللازم مع الجهات التالية فقط:</p>
        <ul className="space-y-2 list-disc list-inside">
          <li>
            <strong className="text-white">المعلم المشترك معه الطالب:</strong> الاسم وبيانات الاشتراك والتقدّم، وقد يظهر رقم الهاتف داخل لوحة المعلم لإدارة الاشتراك والدعم.
          </li>
          <li>
            <strong className="text-white">ولي الأمر:</strong> تقارير تعليمية عبر واتساب على الرقم المسجَّل في الحساب.
          </li>
          <li>
            <strong className="text-white">بوابات الدفع:</strong> شركات الشحن المحلية المستخدمة على المنصة (مثل فودافون كاش وفوري والبطاقات عبر مقدّمي الخدمة الظاهرين في صفحة{" "}
            <Link href="/payment-methods" className="text-sky-400 underline underline-offset-2">
              طرق الدفع
            </Link>
            ) لإتمام العملية فقط.
          </li>
          <li>
            <strong className="text-white">رسائل التحقق:</strong> مزوّد واتساب أو الرسائل النصية لإرسال رمز التأكيد.
          </li>
          <li>
            <strong className="text-white">حماية الفيديو:</strong> أنظمة منع النسخ المستخدمة لتشغيل المحاضرات، دون إرسال اسم الطالب أو هاتفه إلى شبكات الإعلان.
          </li>
        </ul>
        <LegalCallout tone="info" title="لا نبيع البيانات">
          لا نبيع قوائم الطلاب أو أرقام الهواتف لوسطاء أو معلنين. أي مشاركة تتم لتنفيذ الخدمة أو للامتثال لطلب قانوني واجب.
        </LegalCallout>
      </LegalSection>

      <LegalSection
        icon={<Cookie className="w-4 h-4" />}
        iconClass="bg-teal-500/15 text-teal-400 border-teal-500/30"
        title="خامسًا: ملفات الارتباط والقياس الإعلاني"
      >
        <p>
          نستخدم ملفات ارتباط ضرورية لتشغيل الجلسة وتذكّر الجهاز وتأمين الحساب. هذه الملفات لازمة للمنصة ولا يمكن إيقافها دون تعطيل الدخول.
        </p>
        <p>
          على الصفحات العامة فقط (مثل الرئيسية وصفحات المعلمين والكورسات والخطط) قد نستخدم أداة قياس{" "}
          <strong className="text-white">Meta Pixel</strong> لمعرفة ما إذا كانت الحملات الإعلانية تصل إلى المنصة.
        </p>
        <ul className="space-y-2 list-disc list-inside">
          <li>لا تُفعَّل الأداة داخل لوحات الإدارة، أو صفحات المشاهدة والامتحانات والواجبات، أو بوابة ولي الأمر.</li>
          <li>لا نرسل إلى الأداة رقم الهاتف أو البريد الإلكتروني أو بيانات الحساب أو قيمة المشتريات.</li>
          <li>يمكنك رفض هذا التتبع دون أن يتأثر استخدامك للمنصة التعليمية.</li>
        </ul>
      </LegalSection>

      <LegalSection
        icon={<Smartphone className="w-4 h-4" />}
        iconClass="bg-indigo-500/15 text-indigo-400 border-indigo-500/30"
        title="سادسًا: الأجهزة وحماية المحتوى"
      >
        <p>
          نضع معرّفًا للجهاز على المتصفح للحد من مشاركة الحساب وحماية حقوق المعلمين. يمكنك مراجعة الأجهزة المرتبطة بحسابك من صفحة الحساب، وإزالة جهاز لم تعد تستخدمه.
        </p>
        <p>
          تسجيل الخروج أو حذف ملفات الارتباط قد يظهر كجهاز جديد. تجاوز حد الأجهزة المسموح به قد يوقف المشاهدة حتى تُدار الأجهزة من الحساب أو يتواصل الدعم.
        </p>
      </LegalSection>

      <LegalSection
        icon={<Users className="w-4 h-4" />}
        iconClass="bg-pink-500/15 text-pink-400 border-pink-500/30"
        title="سابعًا: الطلاب وولي الأمر"
      >
        <p>
          المنصة موجّهة لطلاب البكالوريا والثانوية. لذلك نطلب رقم ولي الأمر عند التسجيل، وقد نتحقق منه. ولي الأمر يتلقى تقارير عن الحضور والدرجات ونشاط المذاكرة، ويتحمل مسؤولية متابعة استخدام الطالب للمنصة.
        </p>
        <p>
          إذا كان الطالب قاصرًا، يُنشأ الحساب بموافقة ولي الأمر. يحق لولي الأمر طلب تصحيح البيانات أو إيقاف التقارير أو حذف الحساب عبر الدعم.
        </p>
      </LegalSection>

      <LegalSection
        icon={<Clock className="w-4 h-4" />}
        iconClass="bg-orange-500/15 text-orange-400 border-orange-500/30"
        title="ثامنًا: مدة الاحتفاظ"
      >
        <ul className="space-y-2 list-disc list-inside">
          <li>نحتفظ ببيانات الحساب ما دام الحساب نشطًا.</li>
          <li>بعد حذف الحساب، قد تبقى سجلات مالية أو أمنية لمدة لازمة للامتثال القانوني ومنع الاحتيال، ثم تُحذف أو تُزال هويتها.</li>
          <li>رموز التحقق قصيرة العمر وتُحذف بعد استخدامها أو انتهاء صلاحيتها.</li>
        </ul>
      </LegalSection>

      <LegalSection
        icon={<Lock className="w-4 h-4" />}
        iconClass="bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
        title="تاسعًا: حقوقك"
        featured
      >
        <p>يمكنك في أي وقت:</p>
        <ul className="space-y-2 list-disc list-inside">
          <li>الاطلاع على بيانات ملفك وتعديل الاسم أو أرقام الهواتف أو المرحلة من صفحة الحساب.</li>
          <li>إدارة الأجهزة المرتبطة بالحساب.</li>
          <li>حذف الحساب من إعدادات الحساب، أو بطلب إلى الدعم إذا تعذّر الحذف الذاتي.</li>
          <li>رفض ملفات الارتباط الإعلانية دون إيقاف الخدمة التعليمية.</li>
        </ul>
        <p>
          لطلب نسخة من بياناتك أو تصحيحها أو حذفها، راسلنا على{" "}
          <a href="mailto:contact@code-up.tech" className="text-sky-400 underline underline-offset-2" dir="ltr">
            contact@code-up.tech
          </a>
          {" "}أو واتساب{" "}
          <span dir="ltr" className="text-white font-mono">
            01118802621
          </span>
          .
        </p>
      </LegalSection>

      <LegalSection
        icon={<Mail className="w-4 h-4" />}
        iconClass="bg-slate-500/15 text-slate-300 border-slate-500/30"
        title="عاشرًا: الأمان والتواصل وتعديل السياسة"
      >
        <p>
          نستخدم اتصالات مشفّرة وكلمات مرور محمية وإجراءات تقنية لمنع الدخول غير المصرّح به. لا توجد وسيلة إلكترونية آمنة بنسبة مطلقة، لذلك نطلب منك عدم مشاركة كلمة المرور أو رمز التحقق مع أي شخص.
        </p>
        <p>
          قد نحدّث هذه السياسة عند تغيير طريقة جمع البيانات أو استخدامها. يظهر تاريخ آخر تحديث أعلى الصفحة، ويُعد استمرارك في استخدام المنصة بعد النشر اطّلاعًا على النسخة الجديدة.
        </p>
        <p>
          للاستفسار عن الخصوصية:{" "}
          <a href="mailto:contact@code-up.tech" className="text-sky-400 underline underline-offset-2" dir="ltr">
            contact@code-up.tech
          </a>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
