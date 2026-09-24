"use client";

import { useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import {
  PAYMENT_METHODS,
  PAYMENT_CATEGORIES,
  getPaymentMethod,
  type PaymentMethodConfig,
} from "@/lib/payment-methods";
import { PaymentMethodGrid } from "@/components/payment/PaymentMethodGrid";
import { PaymentProviderIcon } from "@/components/payment/PaymentProviderIcon";
import { calculateAmountWithTax } from "@/lib/sha7nawy";
import { PAYMENT_FAQS } from "@/lib/geo-faqs";
import { GeoFaqList } from "@/components/geo/GeoFaqList";

export default function PaymentMethodsPage() {
  const [selectedMethodForModal, setSelectedMethodForModal] = useState<PaymentMethodConfig | null>(null);
  const [calcAmount, setCalcAmount] = useState<number>(100);
  const [calcMethodId, setCalcMethodId] = useState<string>("vf_cash");

  const calcMethod = getPaymentMethod(calcMethodId) || PAYMENT_METHODS[0];
  const { baseAmount, taxAmount, totalAmount, feePercentage } = calculateAmountWithTax(
    calcAmount > 0 ? calcAmount : 0,
    calcMethodId
  );

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 dark:bg-gray-950 font-sans">
      <Navbar />

      <main className="flex-1 pb-16 pt-8">
        {/* ── Hero Section ─────────────────────────────────────────────── */}
        <section dir="rtl" className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-800 p-8 sm:p-12 text-white shadow-xl relative overflow-hidden">
            <div className="relative z-10 max-w-3xl space-y-4">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3.5 py-1 text-xs font-bold backdrop-blur-md">
                ⚡ بوابات الدفع الإلكترونية المعتمدة — Shake-Out & Sha7nawy
              </span>
              <h1 className="text-3xl font-black tracking-tight sm:text-5xl leading-tight">
                طرق الدفع والشحن المعتمدة والآمنة
              </h1>
              <p className="text-sm sm:text-base text-emerald-100 leading-relaxed font-medium">
                ادفع شحن رصيدك أو اشترك في كورساتك بسهولة عبر فوري، البطاقات البنكية، ومحفظة أورانج (عبر Shake-Out) أو فودافون كاش (عبر Sha7nawy). جميع العمليات مشفرة ومؤمنة 100%.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  href="/payment"
                  className="rounded-xl bg-white px-6 py-3 text-sm font-extrabold text-emerald-900 shadow-md transition-transform hover:scale-105"
                >
                  بدء شحن الرصيد الآن ←
                </Link>
                <a
                  href="#calculator"
                  className="rounded-xl border border-white/30 bg-white/10 px-5 py-3 text-sm font-bold text-white hover:bg-white/20 backdrop-blur-sm"
                >
                  حاسبة الرسوم الشفافة
                </a>
              </div>
            </div>

            {/* Decorative background glow */}
            <div className="absolute -left-12 -bottom-12 h-64 w-64 rounded-full bg-emerald-400/20 blur-3xl" />
          </div>
        </section>

        {/* ── Stats Bar ─────────────────────────────────────────────────── */}
        <section dir="rtl" className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 mt-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 text-center dark:border-gray-800 dark:bg-gray-900 shadow-sm">
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">100%</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-bold mt-0.5">تأكيد آمن ومشفر</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 text-center dark:border-gray-800 dark:bg-gray-900 shadow-sm">
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">11+</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-bold mt-0.5">وسيلة دفع متاحة</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 text-center dark:border-gray-800 dark:bg-gray-900 shadow-sm">
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">0%</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-bold mt-0.5">رسوم على إنستاباي</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 text-center dark:border-gray-800 dark:bg-gray-900 shadow-sm">
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">فوري</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-bold mt-0.5">سرعة المعالجة والربط</p>
            </div>
          </div>
        </section>

        {/* ── Fee Calculator Section ────────────────────────────────────── */}
        <section id="calculator" dir="rtl" className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 mt-12">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-1">
                <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                  🧮 حاسبة الرسوم والتكلفة
                </span>
                <h2 className="text-xl font-black text-gray-900 dark:text-white">
                  احسب الإجمالي ورسوم التحويل بدقة قبل الدفع
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  نضمن الشفافية التامة بدون أي مصاريف خفية أو مفاجآت عند الخصم.
                </p>
              </div>

              {/* Calculator Inputs */}
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1">
                    المبلغ الأساسي (ج.م)
                  </label>
                  <input
                    type="number"
                    value={calcAmount}
                    onChange={(e) => setCalcAmount(Math.max(1, Number(e.target.value)))}
                    min={1}
                    max={100000}
                    className="w-32 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-center text-sm font-bold outline-none focus:border-emerald-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1">
                    طريقة الدفع
                  </label>
                  <select
                    value={calcMethodId}
                    onChange={(e) => setCalcMethodId(e.target.value)}
                    className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-bold outline-none focus:border-emerald-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} ({m.feePercentage}% رسوم)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Result display */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-2xl bg-emerald-50/50 p-4 text-center dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-semibold">المبلغ المطلوب</span>
                <p className="text-lg font-black text-gray-900 dark:text-white">{baseAmount.toFixed(2)} ج.م</p>
              </div>
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-semibold">
                  رسوم الخدمة ({feePercentage}%)
                </span>
                <p className="text-lg font-black text-amber-600 dark:text-amber-400">+{taxAmount.toFixed(2)} ج.م</p>
              </div>
              <div>
                <span className="text-xs text-emerald-800 dark:text-emerald-300 font-bold">إجمالي المبلغ المخصوم</span>
                <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">{totalAmount.toFixed(2)} ج.م</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Auto-Generated Payment Grid ───────────────────────────────── */}
        <section dir="rtl" className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 mt-12">
          <div className="space-y-4 mb-6">
            <h2 className="text-2xl font-black text-gray-900 dark:text-white">
              استعرض كافة وسائل الدفع المتاحة
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              اختر أي طريقة لعرض الخطوات التفصيلية أو البدء المباشر في عملية السداد.
            </p>
          </div>

          <PaymentMethodGrid
            methods={PAYMENT_METHODS}
            onOpenDetails={(method) => setSelectedMethodForModal(method)}
            onSelect={(method) => {
              if (method.available) {
                window.location.href = `/payment?method=${method.id}`;
              }
            }}
          />
        </section>

        <section dir="rtl" className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 mt-14">
          <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-4">
            أسئلة شائعة عن الدفع على Code-UP
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-5" data-geo-quote>
            على Code-UP الدفع المحلي متاح: فودافون كاش، إنستاباي، وفوري. التفاصيل والرسوم تظهر قبل التحويل.
          </p>
          <GeoFaqList items={PAYMENT_FAQS} theme="light" />
        </section>
      </main>

      {/* ── Instruction Modal ────────────────────────────────────────────── */}
      {selectedMethodForModal && (
        <div
          dir="rtl"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl dark:bg-gray-900 border border-gray-200 dark:border-gray-800 space-y-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4">
              <div className="flex items-center gap-3">
                <PaymentProviderIcon method={selectedMethodForModal} size={44} />
                <div>
                  <h3 className="font-extrabold text-lg text-gray-900 dark:text-white">
                    {selectedMethodForModal.label}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {selectedMethodForModal.labelEn} • {selectedMethodForModal.processingSpeed}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMethodForModal(null)}
                className="rounded-full p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-4">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {selectedMethodForModal.description}
              </p>

              {/* Instructions step list */}
              {selectedMethodForModal.instructions.length > 0 && (
                <div className="space-y-2 rounded-2xl bg-gray-50 p-4 dark:bg-gray-800/50">
                  <h4 className="text-xs font-extrabold text-gray-900 dark:text-white">
                    خطوات الشحن والسداد:
                  </h4>
                  <ol className="space-y-2">
                    {selectedMethodForModal.instructions.map((step, idx) => (
                      <li key={idx} className="flex items-start gap-2.5 text-xs text-gray-600 dark:text-gray-300">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          {idx + 1}
                        </span>
                        <span className="pt-0.5 leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Fee & limits summary */}
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 font-medium px-1">
                <span>الرسوم الإضافية: {selectedMethodForModal.feePercentage}%</span>
                <span>الحد: {selectedMethodForModal.minAmount} - {selectedMethodForModal.maxAmount.toLocaleString()} ج.م</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedMethodForModal(null)}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                إغلاق
              </button>
              {selectedMethodForModal.available && (
                <Link
                  href={`/payment?method=${selectedMethodForModal.id}`}
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-extrabold text-white hover:bg-emerald-700 shadow-md"
                >
                  ادفع بـ {selectedMethodForModal.label} الآن ←
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
