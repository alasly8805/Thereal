/**
 * Serialize an object for embedding inside a <script type="application/ld+json">
 * tag rendered via dangerouslySetInnerHTML.
 *
 * JSON.stringify does not escape `<`, `>` or `&`, so a value containing
 * `</script>` (e.g. an attacker-controlled teacher name or course title) would
 * close the script element early and inject markup. Encoding those three
 * characters as \uXXXX keeps the payload valid JSON while making that breakout
 * impossible.
 */
const LD_UNSAFE: Record<string, string> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
};

export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/[<>&]/g, (ch) => LD_UNSAFE[ch]);
}
