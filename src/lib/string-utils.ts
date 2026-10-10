/**
 * Pure string utility helpers
 */

export function truncateText(str: string, maxLength: number, suffix = "..."): string {
  if (!str || str.length <= maxLength) return str || "";
  return str.slice(0, maxLength).trimEnd() + suffix;
}

export function cleanArabicWhitespace(text: string): string {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim();
}
