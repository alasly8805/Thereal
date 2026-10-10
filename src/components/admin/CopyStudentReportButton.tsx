"use client";

import React, { useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/sonner";
import { formatStudentReport, type StudentReportData } from "@/lib/student-report-formatter";

export interface CopyStudentReportButtonProps {
  /** Student data object (can be partial from table row or full) */
  student: StudentReportData & { [key: string]: any };
  /** Optional custom URL for student profile link */
  profileUrl?: string;
  /** Optional extra CSS classes */
  className?: string;
  /** Button size variant (default: icon) */
  size?: "icon" | "sm" | "md";
}

/**
 * Premium "Copy Student Report" button.
 * - shadcn Button with variant="ghost", size="icon"
 * - Lucide Copy icon with hover animation
 * - 2-second Check animation upon successful copy
 * - Sonner toast notification: "تم نسخ التقرير ✨"
 * - High-detail WhatsApp report generator
 */
export function CopyStudentReportButton({
  student,
  profileUrl,
  className = "",
  size = "icon",
}: CopyStudentReportButtonProps) {
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (loading || copied) return;

    setLoading(true);
    try {
      let fullData: StudentReportData = { ...student };

      // If the student has an id and we don't already have completedVideos or full details,
      // fetch the latest comprehensive details from the API in the background.
      if (student.id && (!student.completedVideos || !student.quizResults)) {
        try {
          const res = await fetch(`/api/admin/superadmin/students/${student.id}`, {
            credentials: "include",
          });
          if (res.ok) {
            const json = await res.json();
            if (json?.student) {
              fullData = {
                ...fullData,
                ...json.student,
                quizResults: json.quizResults ?? fullData.quizResults,
                watchedCount: json.watchedCount ?? fullData.watchedCount,
                totalVideos: json.totalVideos ?? fullData.totalVideos,
                completedVideos: json.completedVideos ?? fullData.completedVideos,
                homeworkSubmissions: json.homeworkSubmissions ?? fullData.homeworkSubmissions,
                totalHomework: json.totalHomework ?? fullData.totalHomework,
                devices: json.devices ?? fullData.devices,
                maxDevices: json.maxDevices ?? fullData.maxDevices,
              };
            }
          }
        } catch {
          // If network fetch fails, proceed smoothly with the data we already have
        }
      }

      const reportText = formatStudentReport(fullData, { profileUrl });
      await navigator.clipboard.writeText(reportText);

      setCopied(true);
      toast.success("تم نسخ التقرير ✨");

      window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (err) {
      toast.error("تعذر نسخ التقرير إلى الحافظة");
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

      {/* Floating tooltip on hover */}
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

export { CopyStudentReportButton as CopyStudentReport };
export default CopyStudentReportButton;

