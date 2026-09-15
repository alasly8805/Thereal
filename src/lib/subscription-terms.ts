/**
 * Single source of truth for "how many months does a plan actually buy?".
 *
 * This used to be duplicated as three separate `monthsMap` literals that had
 * silently drifted apart (termly was 3 everywhere, but yearly was 10 on the
 * wallet-purchase path and 6 on both the teacher-grant path and the superadmin
 * overview). A student therefore got a different entitlement depending on which
 * code path happened to create their subscription. Every caller now imports
 * from here instead.
 *
 * A term (ترم) is 4 months, and a year is two terms.
 */
export const PLAN_MONTHS: Record<string, number> = {
  monthly: 1,
  termly: 4,
  yearly: 8,
};

export const PLAN_LABELS_AR: Record<string, string> = {
  monthly: "شهر واحد",
  termly: "ترم كامل (٤ شهور)",
  yearly: "سنة كاملة (ترمين)",
};

/** Months of access a plan grants. Unknown plan types fall back to a single month. */
export function getPlanMonths(planType: string | null | undefined): number {
  if (!planType) return 1;
  return PLAN_MONTHS[planType] ?? 1;
}

/**
 * Arabic ordinals used in course/folder titles, e.g. "الشهر الاول برمجة عربي".
 * Both the hamza'd and plain spellings appear in real teacher-authored titles,
 * as do the colloquial forms (التاني / التالت), so all are matched.
 */
const ARABIC_MONTH_ORDINALS: Array<{ month: number; forms: string[] }> = [
  { month: 1, forms: ["الاول", "الأول", "الاولى", "الأولى", "الاولي"] },
  { month: 2, forms: ["الثاني", "الثانى", "التاني", "التانى", "الثانية", "الثانيه"] },
  { month: 3, forms: ["الثالث", "التالت", "الثالثة", "الثالثه"] },
  { month: 4, forms: ["الرابع", "الرابعة", "الرابعه"] },
  { month: 5, forms: ["الخامس", "الخامسة", "الخامسه"] },
  { month: 6, forms: ["السادس", "السادسة", "السادسه"] },
  { month: 7, forms: ["السابع", "السابعة", "السابعه"] },
  { month: 8, forms: ["الثامن", "التامن", "الثامنة", "الثامنه"] },
  { month: 9, forms: ["التاسع", "التاسعة", "التاسعه"] },
  { month: 10, forms: ["العاشر", "العاشرة", "العاشره"] },
];

/** Strip Arabic diacritics and normalise alef/yaa/taa-marbuta so title matching is spelling-tolerant. */
function normaliseArabic(input: string): string {
  return input
    .replace(/[ً-ْٰ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Works out which curriculum month a piece of content belongs to.
 *
 * `Folder.monthIndex` is the intended mechanism and always wins when a teacher
 * has set it. It is null on every folder in production today, so we fall back to
 * reading the month out of the course title ("الشهر الاول ..." → 1) and then the
 * folder title, which is how teachers have actually been labelling months. When
 * nothing can be determined the content counts as month 1, matching how the
 * platform behaves today (one published month for everyone).
 */
export function resolveContentMonth(params: {
  folderMonthIndex?: number | null;
  courseTitle?: string | null;
  folderName?: string | null;
}): number {
  const { folderMonthIndex, courseTitle, folderName } = params;

  if (typeof folderMonthIndex === "number" && folderMonthIndex > 0) {
    return folderMonthIndex;
  }

  for (const title of [courseTitle, folderName]) {
    if (!title) continue;
    const month = parseMonthFromTitle(title);
    if (month) return month;
  }

  return 1;
}

/** Pulls a month number out of a title, e.g. "الشهر الثاني" → 2, "Month 3" → 3. */
export function parseMonthFromTitle(title: string): number | null {
  const text = normaliseArabic(title);

  // "الشهر الاول" / "شهر الثاني" — the ordinal must follow the word شهر.
  for (const { month, forms } of ARABIC_MONTH_ORDINALS) {
    for (const form of forms) {
      if (text.includes(`الشهر ${normaliseArabic(form)}`) || text.includes(`شهر ${normaliseArabic(form)}`)) {
        return month;
      }
    }
  }

  // "الشهر 2" / "شهر ٣" (Arabic-Indic digits included) and English "month 2".
  const arabicDigits = text.match(/شهر\s*([0-9٠-٩]{1,2})/);
  if (arabicDigits) {
    const value = Number(arabicDigits[1].replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)));
    if (value >= 1 && value <= 12) return value;
  }

  const english = title.toLowerCase().match(/month\s*([0-9]{1,2})/);
  if (english) {
    const value = Number(english[1]);
    if (value >= 1 && value <= 12) return value;
  }

  return null;
}
