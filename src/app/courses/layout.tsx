import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "كورسات منصة Code-UP التعليمية",
  description: "تصفح كورسات البرمجة والذكاء الاصطناعي والمواد المتاحة على منصة Code-UP لطلاب البكالوريا في مصر.",
  openGraph: {
    title: "كورسات منصة Code-UP التعليمية",
    description: "تصفح كورسات البرمجة والذكاء الاصطناعي على منصة Code-UP لطلاب البكالوريا في مصر.",
    url: "https://code-up.tech/courses",
    siteName: "منصة Code-UP التعليمية",
    locale: "ar_EG",
    type: "website",
  },
  alternates: {
    canonical: "https://code-up.tech/courses",
  },
};

export default function CoursesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
