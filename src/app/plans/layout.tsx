import { Metadata } from "next";

export const metadata: Metadata = {
  title: "الخطط والمسارات الدراسية | منصة Code-UP",
  description: "تصفح الخطط والمسارات الدراسية المتاحة على منصة Code-UP لطلاب البرمجة والذكاء الاصطناعي.",
  alternates: {
    canonical: "https://code-up.tech/plans",
  },
};

export default function PlansLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
