"use client";

/**
 * Single coherent admin icon set — stroke-based, 24×24, currentColor.
 * Replaces the emoji vocabulary across the admin surfaces for a consistent,
 * premium look. Keyed by a stable name so AdminSidebar can map section ids.
 */

type IconProps = { className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function IconDashboard({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}

export function IconBook({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
    </svg>
  );
}

export function IconClipboard({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function IconPlus({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconDownload({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}


export function IconKey({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M10.5 12.5L20 3M16 7l3 3M14 9l2 2" />
    </svg>
  );
}

export function IconUsers({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

export function IconTicket({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M3 9a3 3 0 010-6h18a3 3 0 010 6 3 3 0 010 6H3a3 3 0 010-6z" />
      <path d="M12 5v.01M12 12v.01M12 19v.01" />
    </svg>
  );
}

export function IconChat({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
    </svg>
  );
}

export function IconChart({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M3 3v18h18" />
      <path d="M18 9l-5 5-3-3-4 4" />
    </svg>
  );
}

export function IconLogout({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

export function IconTrash({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function IconFolder({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M4 4h5l2 3h9a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z" />
    </svg>
  );
}

export function IconVideo({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="2" y="5" width="14" height="14" rx="2" />
      <path d="M16 9l6-3v12l-6-3" />
    </svg>
  );
}

export function IconFile({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

export function IconLink({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  );
}

export function IconSettings({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

export function IconTag({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
      <path d="M7 7h.01" />
    </svg>
  );
}

export function IconGlobe({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  );
}

export function IconMenu({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M3 12h18M3 6h18M3 18h18" />
    </svg>
  );
}

export function IconClose({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

export function IconEdit({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

export function IconCheck({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function IconChevronLeft({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function IconShield({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

export function IconClock({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

export function IconEye({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconMap({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </svg>
  );
}

/* ─── AI Section Icons ─────────────────────────────────────────────────── */

export function IconBrain({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M12 2a7 7 0 017 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 01-2 2h-4a2 2 0 01-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 017-7z" />
      <path d="M9 22h6M10 17v5M14 17v5" />
    </svg>
  );
}

export function IconActivity({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

export function IconCpu({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
    </svg>
  );
}

export function IconZap({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

export function IconDollar({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  );
}

export function IconFlag({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

export function IconBell({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}

export function IconDatabase({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

export function IconTool({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

export function IconMemory({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
      <path d="M12 3v0M8.5 4.5l-.1-.1M5 7h0M8.5 9.5l-.1.1" />
    </svg>
  );
}

export function IconHeart({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
    </svg>
  );
}

export function IconToggle({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="1" y="5" width="22" height="14" rx="7" />
      <circle cx="16" cy="12" r="3" />
    </svg>
  );
}

export function IconServer({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="2" y="2" width="20" height="8" rx="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  );
}

// Section-id → icon, used by AdminSidebar. Falls back to a dot if unmapped.
export const SECTION_ICONS: Record<string, (p: IconProps) => React.ReactElement> = {
  plans: IconMap,
  dashboard: IconDashboard,
  overview: IconChart,
  "my-page": IconGlobe,
  courses: IconBook,
  "quiz-results": IconClipboard,
  "create-course": IconPlus,
  create: IconPlus,
  codes: IconKey,
  students: IconUsers,
  "deleted-students": IconUsers,
  teachers: IconUsers,
  "deleted-teachers": IconTrash,
  "staff-accounts": IconUsers,
  "daily-exams": IconChart,
  logs: IconFile,
  errors: IconShield,
  instance: IconKey,
  "site-text": IconFile,
  "advanced-settings": IconShield,
  "danger-zone": IconTrash,
  requests: IconTicket,
  feedback: IconChat,
  homework: IconFile,
  review: IconClipboard,
  wallet: IconDollar,
  testers: IconShield,
  "center-passes": IconKey,
  // ── AI Section ──
  "ai-copilot": IconBrain,
  "ai-studio": IconBrain,
  "ai-overview": IconBrain,
  "ai-live": IconActivity,
  "ai-requests": IconChat,
  "ai-playground": IconZap,
  "ai-providers": IconServer,
  "ai-gemini-pool": IconDatabase,
  "ai-budget": IconDollar,
  "ai-prompts": IconFile,
  "ai-knowledge": IconBook,
  "ai-actions": IconClipboard,
  "ai-tools": IconTool,
  "ai-memory": IconMemory,
  "ai-student-analytics": IconUsers,
  "ai-teacher-analytics": IconUsers,
  "ai-parent-analytics": IconHeart,
  "ai-provider-analytics": IconChart,
  "ai-cost-analytics": IconDollar,
  "ai-cache-analytics": IconDatabase,
  "ai-alerts": IconBell,
  "ai-audit": IconShield,
  "ai-feature-flags": IconToggle,
  "ai-settings": IconSettings,
  "ai-health": IconCpu,
};
