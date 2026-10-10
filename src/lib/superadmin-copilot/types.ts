export type CopilotChart = {
  id: string;
  type: "bar" | "line";
  title: string;
  unit?: string;
  series: Array<{
    key: string;
    label: string;
    color?: string;
  }>;
  points: Array<{ x: string; values: Record<string, number> }>;
};

export type CopilotTable = {
  id: string;
  title: string;
  columns: string[];
  rows: string[][];
};

export type CopilotKpi = {
  key: string;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "warn" | "bad" | "gold";
};

export type CopilotLink = {
  section: string;
  label: string;
};

/** A change the model prepared. The chat cannot apply it; the confirm button does. */
export type CopilotProposal = {
  token: string;
  title: string;
  detail: string;
  before: string;
  after: string;
};

export type ToolResult = {
  ok: boolean;
  summary: string;
  data: unknown;
  charts?: CopilotChart[];
  tables?: CopilotTable[];
  kpis?: CopilotKpi[];
  links?: CopilotLink[];
  proposal?: CopilotProposal;
};

export type CopilotMessage = {
  role: "user" | "assistant";
  content: string;
};

export type CopilotModelInfo = {
  id: string;
  label: string;
  provider: string;
  fallback: boolean;
};

export const COPILOT_TOOLS: Array<{
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> = [
  {
    type: "function",
    function: {
      name: "get_money_summary",
      description:
        "Platform money for a date range in Africa/Cairo: gross paid, platform share, teachers share, expenses, net profit, and a daily series for graphs. Use this for any net/profit/revenue question like 'net from 9 September to 20'. Dates are YYYY-MM-DD. Omit dates to use the last 14 Cairo days.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Start day YYYY-MM-DD (Cairo). Inclusive." },
          to: { type: "string", description: "End day YYYY-MM-DD (Cairo). Inclusive." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_periods",
      description:
        "Compare money and signups of one Cairo date range against the previous period of the same length. Use when the user says compare, vs last week, this month vs last month.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string" },
          to: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_platform_kpis",
      description:
        "Live HQ snapshot: students, teachers, courses, active bookings, pending payments, all-time net, alerts. Use for 'how is the platform now' or a briefing.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "search_students",
      description:
        "Search real students by name, phone, or email. Returns balance, stage, created date. Never invent students — if empty, say not found.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Name, phone, or email" },
          limit: { type: "number", description: "Max results, default 15, max 25" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_student_detail",
      description:
        "Full dossier for one student: profile, wallet, teacher bookings, paid courses. Identify by id, phone, or exact name.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Student id, phone, or name" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_prices",
      description:
        "Catalog of teacher booking plan prices (monthly/termly/yearly) and paid course prices with discounts and enrollments.",
      parameters: {
        type: "object",
        properties: {
          teacherName: { type: "string", description: "Optional teacher name filter" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_teachers_finance",
      description:
        "Teachers ranked by revenue with platform vs teacher share, paid bookings, and course count.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_signups",
      description: "Student signups per Cairo day for a date range. Use for graphs of new accounts.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string" },
          to: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_alerts",
      description:
        "Pending gateway invoices (students stuck in checkout) plus recent access-monitor warnings (zero-amount bookings, unpaid enrollments).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "search_platform",
      description:
        "Unified search across students, teachers, and courses. Use when the query is a name that could be any of them.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_student_grades",
      description:
        "Read one student's leaderboard points plus recent quiz and homework scores (percent). Use before changing a degree. If several students match, ask which one. Never invent a score.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Student id, phone, or name" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_points_change",
      description:
        "PREPARE ONLY. Does not save. Propose adding or setting one student's leaderboard points. mode=add for 'plus 100' / 'زود 100' (amount may be negative to subtract). mode=set for 'make the points 500'. The superadmin must press confirm. If several students match, do not call this — ask which one.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Student id, phone, or name" },
          mode: { type: "string", enum: ["add", "set"], description: "add = plus/minus, set = replace the total" },
          amount: { type: "integer", description: "Whole points. add: -10000 to 10000, not zero. set: 0 to 1000000." },
        },
        required: ["query", "mode", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_grade_change",
      description:
        "PREPARE ONLY. Does not save. Propose setting one quiz or homework official percentage (الدرجة) from 0 to 100. Call list_student_grades first and pass targetId. Use which=latest only when the user explicitly said the latest exam. If the title matches more than one exam, ask which one. Individual answers are not rewritten. The superadmin must press confirm.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Student id, phone, or name" },
          kind: { type: "string", enum: ["quiz", "homework"] },
          score: { type: "number", description: "New percentage, 0 to 100" },
          targetId: { type: "string", description: "quizId or homeworkId from list_student_grades" },
          title: { type: "string", description: "Exam title fragment, used only when targetId is omitted" },
          which: { type: "string", enum: ["latest"], description: "Only when the user said the latest exam and no targetId/title" },
        },
        required: ["query", "kind", "score"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "READ-ONLY. Read a source file inside the Code-UP repo (Thefake). Never for .env or secrets. Use offset for later lines. Diagnose only — you cannot edit.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path e.g. src/app/api/ai/chat/route.ts" },
          offset: { type: "number", description: "1-based line to start at" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "READ-ONLY. List a directory under the Code-UP repo.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Relative directory, default ." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_code",
      description: "READ-ONLY. Search src/scripts/prisma for a literal string. Use to find the code behind a bug.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          glob: { type: "string", description: "Optional filename fragment e.g. route.ts" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_logs",
      description:
        "READ-ONLY. Tail a named log. which = watchdog | watchdog-events | pm2-out | pm2-error. Secrets are redacted.",
      parameters: {
        type: "object",
        properties: {
          which: { type: "string" },
          lines: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "inspect_health",
      description: "READ-ONLY. PM2 status, disk, RAM, current BUILD_ID. Never restarts anything.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "inspect_git",
      description: "READ-ONLY. git status and recent commits. Never commit, checkout, or push.",
      parameters: { type: "object", properties: {} },
    },
  },
];
