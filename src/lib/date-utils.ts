/**
 * Localized date and time formatting utilities
 */

const arabicDateFormatter = new Intl.DateTimeFormat("ar-EG", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

export function formatArabicDate(date: Date | string | number): string {
  const d = typeof date === "object" ? date : new Date(date);
  if (isNaN(d.getTime())) return "";
  return arabicDateFormatter.format(d);
}
