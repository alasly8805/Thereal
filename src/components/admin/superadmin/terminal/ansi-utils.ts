// Utility for stripping ANSI and parsing ANSI escape sequences to React styles

export function stripAnsi(str: string): string {
  if (!str) return "";
  // Strips standard ANSI 7-bit and 8-bit escape codes
  return str.replace(
    /[\u001B\u009B][[()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g,
    ""
  );
}

export interface AnsiSpan {
  text: string;
  style: React.CSSProperties;
  className?: string;
}

const COLOR_MAP: Record<number, string> = {
  30: "#1e293b", // black
  31: "#f87171", // red
  32: "#4ade80", // green
  33: "#facc15", // yellow
  34: "#60a5fa", // blue
  35: "#c084fc", // magenta
  36: "#22d3ee", // cyan
  37: "#f1f5f9", // white
  90: "#94a3b8", // bright black (gray)
  91: "#fca5a5", // bright red
  92: "#86efac", // bright green
  93: "#fde047", // bright yellow
  94: "#93c5fd", // bright blue
  95: "#d8b4fe", // bright magenta
  96: "#67e8f9", // bright cyan
  97: "#ffffff", // bright white
};

const BG_COLOR_MAP: Record<number, string> = {
  40: "#000000",
  41: "#7f1d1d",
  42: "#14532d",
  43: "#713f12",
  44: "#1e3a8a",
  45: "#581c87",
  46: "#164e63",
  47: "#f8fafc",
};

export function parseAnsiToSpans(input: string): AnsiSpan[] {
  if (!input) return [];

  // Match ANSI escape codes
  const regex = /\u001b\[([0-9;]*)m/g;
  const spans: AnsiSpan[] = [];

  let lastIndex = 0;
  let currentStyle: React.CSSProperties = {};
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input)) !== null) {
    const textChunk = input.substring(lastIndex, match.index);
    if (textChunk) {
      spans.push({ text: textChunk, style: { ...currentStyle } });
    }

    const codeStr = match[1];
    if (!codeStr || codeStr === "0") {
      currentStyle = {};
    } else {
      const codes = codeStr.split(";").map((c) => parseInt(c, 10));
      for (let i = 0; i < codes.length; i++) {
        const code = codes[i];
        if (code === 0) {
          currentStyle = {};
        } else if (code === 1) {
          currentStyle.fontWeight = "700";
        } else if (code === 2) {
          currentStyle.opacity = 0.75;
        } else if (code === 3) {
          currentStyle.fontStyle = "italic";
        } else if (code === 4) {
          currentStyle.textDecoration = "underline";
        } else if (COLOR_MAP[code]) {
          currentStyle.color = COLOR_MAP[code];
        } else if (BG_COLOR_MAP[code]) {
          currentStyle.backgroundColor = BG_COLOR_MAP[code];
        } else if (code === 39) {
          delete currentStyle.color;
        } else if (code === 49) {
          delete currentStyle.backgroundColor;
        }
      }
    }

    lastIndex = regex.lastIndex;
  }

  const remaining = input.substring(lastIndex);
  if (remaining) {
    spans.push({ text: remaining, style: { ...currentStyle } });
  }

  return spans;
}
