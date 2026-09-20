import type { Metadata } from "next";
import Link from "next/link";
import {
  Scale,
  UserCheck,
  ShieldAlert,
  Lock,
  Wallet,
  RotateCcw,
  AlertTriangle,
  Ban,
  Gavel,
  CheckCircle2,
} from "lucide-react";
import { LegalCallout, LegalPage, LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "الشروط والأحكام | منصة Code-UP",
  description:
    "اتفاقية استخدام منصة Code-UP: الحساب، حقوق المحتوى، الرصيد والمدفوعات، إلغاء الاشتراك، والقانون الواجب التطبيق.",
  alternates: { canonical: "https://code-up.tech/terms" },
  openGraph: {
    title: "الشروط والأحكام — منصة Code-UP",
    description: "قواعد الحساب والمحتوى والدفع والإلغاء على منصة كود اب.",
    url: "https://code-up.tech/terms",
    siteName: "منصة Code-UP",
    locale: "ar_EG",
    type: "article",
  },
};

export default function TermsPage() {
  return (
    <LegalPage
      badge={
        <>
          <Scale className="w-4 h-4 text-sky-400" />
          <span>الاتفاقية الرسمية لاستخدام المنصة</span>
        </>
      }
      title="الشروط والأحكام"
      intro="يرجى قراءة هذه البنود بعناية قبل إنشاء الحساب أو الاشتراك. بالمتابعة أو بإنشاء الحساب فإنك توافق على هذه الشروط وعلى سياسة الخصوصية."
      updated="٢٠ سبتمبر ٢٠٢٦"
      siblingHref="/privacy"
      siblingLabel="اقرأ أيضًا: سياسة الخصوصية"
    >
      <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-sky-950/60 via-slate-900/90 to-sky-950/60 border border-sky-500/40 shadow-xl">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-2xl bg-sky-500/20 text-sky-300 flex items-center justify-center shrink-0 mt-0.5 border border-sky-400/30">
            <Scale className="w-5 h-5" />
          </div>
          <div className="leading-relaxed">
            <h2 className="text-base sm:text-lg font-black text-white mb-1.5">نطاق الاتفاقية</h2>
            <p className="text-xs sm:text-sm text-slate-300 font-medium">
              تسري هذه الشروط على استخدام موقع{" "}
              <span dir="ltr">code-up.tech</span> والخدمات التعليمية المرتبطة به. سياسة التعامل مع البيانات موضّحة في{" "}
              <Link href="/privacy" className="text-sky-300 underline underline-offset-2">
                سياسة الخصوصية
              </Link>
              ، وتُعد جزءًا مكمّلًا لهذه الاتفاقية.
            </p>
          </div>
        </div>
      </div>

      <LegalSection
        icon={<UserCheck className="w-4 h-4" />}
        iconClass="bg-sky-500/15 text-sky-400 border-sky-500/30"
        title="أولًا: الأهلية والحساب"
      >
        <ul className="space-y-2 list-disc list-inside">
          <li>المنصة خدمة تعليمية خاصة لطلاب البكالوريا والثانوية، وللمعلمين وأولياء الأمور المرتبطين بهم.</li>
          <li>يجب إدخال بيانات صحيحة، بما في ذلك رقم هاتف الطالب ورقم ولي الأمر.</li>
          <li>إذا كان المستخدم قاصرًا، يُنشأ الحساب بموافقة ولي الأمر الذي يتحمّل متابعة الاستخدام.</li>
          <li>الحساب شخصي. يُحظر إعارته أو بيعه أو مشاركة بيانات الدخول مع الغير.</li>
          <li>المنصة ليست تابعة لوزارة التربية والتعليم، وليست بديلًا لحساب الطالب على كيريو.</li>
        </ul>
      </LegalSection>

      <LegalSection
        icon={<Lock className="w-4 h-4" />}
        iconClass="bg-purple-500/15 text-purple-400 border-purple-500/30"
        title="ثانيًا: حقوق الملكية الفكرية"
      >
        <p>
          جميع المحتويات التعليمية على منصة Code-UP — بما في ذلك الفيديوهات والملفات والملخصات والاختبارات والتسجيلات الصوتية والصور وأي مواد أخرى — ملك للمنصة أو لأصحاب الحقوق الذين صرّحوا لها بنشرها.
        </p>
        <LegalCallout tone="warning" title="حظر النسخ وإعادة النشر">
          يُحظر نسخ المحتوى أو تصويره أو تسجيله أو إعادة نشره أو توزيعه أو بيعه أو مشاركته بأي وسيلة، دون موافقة كتابية مسبقة من منصة Code-UP أو صاحب الحق.
        </LegalCallout>
        <p className="text-slate-400 font-semibold text-xs">
          تحتفظ المنصة بحق إيقاف الحساب واتخاذ الإجراءات القانونية عند انتهاك حقوق الملكية الفكرية أو محاولة كسر حماية الفيديو.
        </p>
      </LegalSection>

      <LegalSection
        icon={<ShieldAlert className="w-4 h-4" />}
        iconClass="bg-rose-500/15 text-rose-400 border-rose-500/30"
        title="ثالثًا: الاستخدام المقبول وحماية المشاهدة"
      >
        <ul className="space-y-2 list-disc list-inside">
          <li>يُستخدم الحساب للدراسة فقط، وليس لإعادة بيع المحتوى أو بثّه خارج المنصة.</li>
          <li>يُحظر استخدام برامج تسجيل الشاشة أو تعطيل حماية الفيديو أو محاولة اختراق المنصة.</li>
          <li>قد نقيّد عدد الأجهزة المرتبطة بالحساب. تجاوز الحد قد يوقف المشاهدة حتى تُدار الأجهزة أو يتواصل الدعم.</li>
          <li>السلوك المسيء أو الغش في الاختبارات أو إساءة استخدام الدعم قد يؤدي إلى إيقاف الحساب دون إعادة الرصيد نقدًا.</li>
        </ul>
      </LegalSection>

      <LegalSection
        icon={<Wallet className="w-4 h-4" />}
        iconClass="bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
        title="رابعًا: سياسة الرصيد والمدفوعات"
      >
        <ul className="space-y-2 list-disc list-inside">
          <li>
            المبالغ التي تُشحن إلى محفظة الطالب داخل منصة Code-UP{" "}
            <strong className="text-white">لا تُسترد نقدًا ولا تُحوَّل إلى أموال خارج المنصة</strong> بعد إتمام الشحن.
          </li>
          <li>يحق للطالب استخدام الرصيد المشحون بالكامل في شراء الكورسات أو الخدمات التعليمية المتاحة داخل المنصة.</li>
          <li>
            رسوم وسائل الدفع تظهر قبل التأكيد في صفحة{" "}
            <Link href="/payment-methods" className="text-sky-400 underline underline-offset-2">
              طرق الدفع
            </Link>
            .
          </li>
        </ul>
      </LegalSection>

      <LegalSection
        icon={<RotateCcw className="w-4 h-4" />}
        iconClass="bg-sky-500/15 text-sky-400 border-sky-500/30"
        title="خامسًا: إلغاء الاشتراك في الكورس"
      >
        <ul className="space-y-2 list-disc list-inside">
          <li>
            يحق للطالب طلب إلغاء الاشتراك خلال مدة أقصاها{" "}
            <strong className="text-sky-300">٢٤ ساعة</strong> من تاريخ الاشتراك.
          </li>
          <li>
            إذا قُبل طلب الإلغاء وفق سياسة المنصة، تُعاد قيمة الكورس إلى{" "}
            <strong className="text-white">محفظة الطالب داخل المنصة فقط</strong>، ولا تُرد نقدًا ولا تُحوَّل إلى أي وسيلة دفع خارجية.
          </li>
          <li>يمكن استخدام الرصيد المعاد للاشتراك في أي كورس آخر داخل المنصة، في المادة نفسها أو في مادة مختلفة.</li>
          <li>بعد انقضاء ٢٤ ساعة، أو بعد استهلاك قدر جوهري من المحتوى، لا يُقبل الإلغاء إلا في الحالات الاستثنائية التي تقدرها المنصة.</li>
        </ul>
      </LegalSection>

      <LegalSection
        icon={<AlertTriangle className="w-4 h-4" />}
        iconClass="bg-amber-500/15 text-amber-400 border-amber-500/30"
        title="سادسًا: الظروف القاهرة الخاصة بالمعلم"
      >
        <p>
          إذا تعرّض أحد المعلمين لظرف قاهر — مثل الوفاة أو المرض الشديد، لا قدر الله — أو أي ظرف يمنعه من استكمال تقديم الكورس، تلتزم منصة Code-UP بمواصلة الخدمة التعليمية للطلاب عبر معلمين آخرين.
        </p>
        <p>
          يجوز للمنصة الاستعانة بالمحتوى الذي سبق أن سجّله المعلم، بشرط أن يطابق المنهج الدراسي المعتمد، وألا ينقص ذلك المحتوى العلمي المقدَّم للطالب.
        </p>
      </LegalSection>

      <LegalSection
        icon={<Ban className="w-4 h-4" />}
        iconClass="bg-slate-500/15 text-slate-300 border-slate-500/30"
        title="سابعًا: إخلاء المسؤولية وتعديل الخدمة"
      >
        <ul className="space-y-2 list-disc list-inside">
          <li>المنصة وسيلة شرح وتدريب خاصة، ولا تضمن درجة معيّنة في الامتحان الرسمي.</li>
          <li>قد تتوقف الخدمة مؤقتًا للصيانة أو لعطل خارج عن الإرادة. نسعى لإعادة التشغيل في أقرب وقت ممكن.</li>
          <li>يجوز تعديل المحتوى أو المواعيد أو طريقة الإتاحة بما لا يُسقط حق الطالب في المدة المدفوعة قدر الإمكان.</li>
        </ul>
      </LegalSection>

      <LegalSection
        icon={<Gavel className="w-4 h-4" />}
        iconClass="bg-indigo-500/15 text-indigo-400 border-indigo-500/30"
        title="ثامنًا: القانون الواجب التطبيق"
      >
        <p>
          تخضع هذه الاتفاقية لقوانين جمهورية مصر العربية. أي نزاع ينشأ عن استخدام المنصة يُسعى أولًا إلى حلّه وديًا عبر الدعم، فإن تعذّر ذلك تكون المحاكم المصرية صاحبة الاختصاص.
        </p>
        <p>
          للاستفسار:{" "}
          <a href="mailto:contact@code-up.tech" className="text-sky-400 underline underline-offset-2" dir="ltr">
            contact@code-up.tech
          </a>
          {" "}أو واتساب{" "}
          <span dir="ltr" className="font-mono text-white">
            01118802621
          </span>
          .
        </p>
      </LegalSection>

      <LegalSection
        icon={<CheckCircle2 className="w-5 h-5" />}
        iconClass="bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
        title="تاسعًا: الموافقة"
        featured
      >
        <p className="font-medium">بالمتابعة أو بإنشاء الحساب، يقر المستخدم بأنه:</p>
        <div className="space-y-2.5">
          {[
            "اطّلع على جميع البنود السابقة وعلى سياسة الخصوصية وفهمها.",
            "يوافق على الالتزام بها أثناء استخدام المنصة.",
            "يقر بأن موافقته الإلكترونية موافقة ملزمة وفق الأنظمة المعمول بها في جمهورية مصر العربية.",
          ].map((item) => (
            <div
              key={item}
              className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 text-slate-200 text-xs sm:text-sm font-semibold"
            >
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs shrink-0">
                ✓
              </span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </LegalSection>
    </LegalPage>
  );
}
