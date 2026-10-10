/**
 * Academic grade calculation helpers
 */

export type GradeBand = "EXCELLENT" | "VERY_GOOD" | "GOOD" | "PASS" | "NEEDS_IMPROVEMENT";

export function computeGradeBand(percentage: number): GradeBand {
  if (percentage >= 85) return "EXCELLENT";
  if (percentage >= 75) return "VERY_GOOD";
  if (percentage >= 65) return "GOOD";
  if (percentage >= 50) return "PASS";
  return "NEEDS_IMPROVEMENT";
}
