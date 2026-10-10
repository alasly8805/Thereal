/** Digits only, without the Egypt country code or a leading zero. */
export function phoneCore(raw: string | null | undefined): string {
  let digits = (raw || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("20") && digits.length >= 12) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

/** True when two numbers are the same mobile, whether stored as 01… or +20…. */
export function phonesMatch(stored: string | null | undefined, query: string): boolean {
  const q = phoneCore(query);
  if (q.length < 7) return false;
  const s = phoneCore(stored);
  if (!s) return false;
  return s.includes(q) || q.includes(s);
}
