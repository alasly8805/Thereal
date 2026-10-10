import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { PracticeClient } from "@/components/student/PracticeClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "تدريبات اليوم | منصة Code-UP التعليمية",
  robots: { index: false, follow: false },
};

export default async function PracticePage() {
  const session = await getSession();
  if (!session) redirect("/login?callbackUrl=/practice");

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--bg)", fontFamily: "var(--font-body)" }}>
      <Navbar user={{ id: session.id, name: session.name, role: session.role }} />
      <main className="flex-1 w-full max-w-[860px] mx-auto px-4 sm:px-6 py-8 sm:py-10" dir="rtl">
        {session.role === "student" ? (
          <PracticeClient />
        ) : (
          <div className="text-center rounded-[22px] p-10" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", margin: 0 }}>التدريبات اليومية متاحة للطلاب فقط.</p>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
