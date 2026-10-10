"use client";

import React, { useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/sonner";

export interface CopyStudentReportProps {
  student: {
    id: string;
    name?: string | null;
    code?: string | null;
    shareCode?: string | null;
    referralCode?: string | null;
    points?: number | null;
    watchedCount?: number | null;
    completedVideos?: any[] | null;
    [key: string]: any;
  };
  className?: string;
  size?: "icon" | "sm" | "md";
}

export function CopyStudentReport({ student, className = "", size = "icon" }: CopyStudentReportProps) {
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (loading || copied) return;

    setLoading(true);
    try {
      const studentId = student.id;
      let fullReport: any = null;

      if (studentId) {
        try {
          const res = await fetch(`/api/students/${studentId}/full-report`, {
            credentials: "include",
          });
          if (res.ok) {
            fullReport = await res.json();
          }
        } catch (fetchErr) {
          console.error("Error fetching full student report:", fetchErr);
        }
      }

      const name = fullReport?.name || fullReport?.student?.name || student.name || "—";
      const parentCode =
        student.code ||
        (student as any).shareCode ||
        fullReport?.parentCode ||
        fullReport?.student?.code ||
        student.id ||
        "—";

      const origin = typeof window !== "undefined" ? window.location.origin : "https://code-up.tech";
      const parentLink = `${origin}/p/${parentCode}`;

      const videoProgress: any[] = fullReport?.videoProgress || [];
      const totalLectures: number = fullReport?.totalLectures ?? (videoProgress.length || 0);
      const watched: number =
        fullReport?.watched ?? fullReport?.completedCount ?? (videoProgress.filter((v: any) => v.watched).length || student.watchedCount || 0);

      const homeworks: any[] = fullReport?.homeworks || [];
      const submissions: any[] = fullReport?.submissions || [];
      const points: number = fullReport?.points ?? student.points ?? 0;

      const lines: string[] = [
        `📊 تقرير الطالب: ${name}`,
        `🆔 الكود: ${parentCode}`,
        `🔗 رابط متابعة ولي الأمر: ${parentLink}`,
        "",
        `📚 الحصص: ${totalLectures}`,
        `✅ المشاهد: ${watched}/${totalLectures}`,
      ];

      if (homeworks.length > 0) {
        lines.push("");
        lines.push("📝 الواجبات بالتفصيل:");
        for (const h of homeworks) {
          const lectureTitle = h.homework?.lecture?.title || h.lectureTitle || "المحاضرة";
          const hwTitle = h.homework?.title || h.title || "واجب";
          const gradeStr = h.grade || (h.score != null ? `${h.score}/${h.homework?.totalMarks ?? 10}` : "لم يتم الحل");
          lines.push(`• محاضرة: ${lectureTitle} | واجب: ${hwTitle} | الدرجة: ${gradeStr}`);
        }
      }

      if (submissions.length > 0) {
        lines.push("");
        lines.push("📝 الامتحانات بالتفصيل:");
        for (const s of submissions) {
          const lectureTitle = s.quiz?.lecture?.title || s.lectureTitle || "المحاضرة";
          const quizTitle = s.quiz?.title || s.title || "امتحان";
          const gradeStr = s.grade || (s.score != null ? `${s.score}/${s.quiz?.totalMarks ?? 100}` : "لم يتم الحل");
          const date = s.date || (s.completedAt ? new Date(s.completedAt).toLocaleDateString("ar-EG") : "—");
          lines.push(`• محاضرة: ${lectureTitle} | امتحان: ${quizTitle} | الدرجة: ${gradeStr} | التاريخ: ${date}`);
        }
      }

      lines.push("");
      lines.push(`⭐ إجمالي النقاط: ${points}`);

      const report = lines.join("\n");

      await navigator.clipboard.writeText(report);
      setCopied(true);
      toast.success("تم نسخ التقرير ✨");

      window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      toast.error("تعذر نسخ التقرير");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative inline-flex group items-center justify-center">
      <Button
        variant="ghost"
        size={size}
        onClick={handleCopy}
        disabled={loading}
        title="نسخ التقرير"
        aria-label="نسخ التقرير"
        className={`h-8 w-8 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-all duration-200 active:scale-95 cursor-pointer ${
          copied ? "!text-emerald-600 dark:!text-emerald-400 !bg-emerald-50 dark:!bg-emerald-950/40" : ""
        } ${className}`}
      >
        {loading ? (
          <Loader2 size={15} className="animate-spin text-slate-400" />
        ) : copied ? (
          <Check size={15} className="text-emerald-600 dark:text-emerald-400 animate-in zoom-in-75 duration-200" />
        ) : (
          <Copy size={15} className="transition-transform group-hover:scale-110 duration-200" />
        )}
      </Button>

      {/* Floating tooltip */}
      <span
        role="tooltip"
        className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-150 dark:bg-slate-100 dark:text-slate-900 z-50"
      >
        نسخ التقرير
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900 dark:border-t-slate-100" />
      </span>
    </div>
  );
}

export default CopyStudentReport;
