export type HomeworkNoticeTone = "passed" | "failed" | "pending" | "retake";

export type HomeworkNotice = {
  tone: HomeworkNoticeTone;
  badge: string;
  title: string;
  detail?: string;
};

function timeOf(value: string | Date | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * A rejected upload that was replaced goes back to "قيد المراجعة", which used
 * to hide the rejection. The student still needs to see both facts: the last
 * reviewed file was rejected, and the teacher or assistant allowed another upload.
 */
export function studentHomeworkNotice(input: {
  type?: string | null;
  status: string;
  allowRetake?: boolean | null;
  completedAt?: string | Date | null;
  review?: { verdict?: string | null; reviewedAt?: string | Date | null } | null;
}): HomeworkNotice {
  const status = input.status;
  const allowRetake = !!input.allowRetake;
  const verdict = input.review?.verdict ?? null;
  const replacedAfterReject =
    verdict === "failed" &&
    (status === "review_requested" || status === "pending") &&
    timeOf(input.completedAt) > timeOf(input.review?.reviewedAt);

  if (replacedAfterReject) {
    return {
      tone: "failed",
      badge: "مرفوض · نسخة جديدة",
      title: "الملف السابق اترفض، والمعلم سمح برفع نسخة جديدة",
      detail: "النسخة الحالية قيد المراجعة والمحتوى التالي مفتوح. لو اتقبلت يكمل مفتوح، ولو اترفضت يتقفل.",
    };
  }

  if (status === "failed") {
    return {
      tone: "failed",
      badge: allowRetake ? "مرفوض — مسموح إعادة الرفع" : "مرفوض",
      title: allowRetake
        ? "الملف اترفض، والمعلم سمحلك ترفع نسخة جديدة"
        : "تم رفض الملف",
      detail: allowRetake
        ? "ارفع الملف من جديد. بعد الرفع المحتوى التالي يتفتح، ولو المعلم قبله يكمل مفتوح، ولو رفضه يتقفل."
        : "المحتوى التالي متقفل. إعادة الرفع تتفتح بس لما المعلم أو المساعد يسمح بيها.",
    };
  }

  if (allowRetake) {
    return {
      tone: "retake",
      badge: "مسموح إعادة المحاولة",
      title: "المعلم فتح لك محاولة تانية",
    };
  }

  if (status === "passed") {
    return {
      tone: "passed",
      badge: "مكتمل بنجاح",
      title: "أحسنت! تم تسليم الواجب واجتيازه بنجاح",
    };
  }

  return {
    tone: "pending",
    badge: "قيد المراجعة",
    title: "تم تسليم الواجب — في انتظار مراجعة المعلم",
  };
}
