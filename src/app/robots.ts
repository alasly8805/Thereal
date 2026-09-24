import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const disallowed = ["/adminpanel/", "/api/", "/parent/", "/student/", "/account/", "/demo", "/courses/*/watch/"];

  const publicAllow = {
    allow: "/",
    disallow: disallowed,
  };

  return {
    rules: [
      { userAgent: "*", ...publicAllow },
      { userAgent: "Googlebot", ...publicAllow },
      { userAgent: "Bingbot", ...publicAllow },
      { userAgent: "GPTBot", ...publicAllow },
      { userAgent: "OAI-SearchBot", ...publicAllow },
      { userAgent: "ChatGPT-User", ...publicAllow },
      { userAgent: "PerplexityBot", ...publicAllow },
      { userAgent: "ClaudeBot", ...publicAllow },
      { userAgent: "anthropic-ai", ...publicAllow },
      { userAgent: "Applebot-Extended", ...publicAllow },
      { userAgent: "Google-Extended", ...publicAllow },
      { userAgent: "GoogleOther", ...publicAllow },
      { userAgent: "cohere-ai", ...publicAllow },
      { userAgent: "Amazonbot", ...publicAllow },
      { userAgent: "meta-externalagent", ...publicAllow },
      { userAgent: "FacebookBot", ...publicAllow },
      { userAgent: "Bytespider", ...publicAllow },
      { userAgent: "YouBot", ...publicAllow },
      { userAgent: "CCBot", ...publicAllow },
      { userAgent: "Diffbot", ...publicAllow },
      { userAgent: "Google-CloudVertexBot", ...publicAllow },
      { userAgent: "Gemini-Deep-Research", ...publicAllow },
      { userAgent: "Perplexity-User", ...publicAllow },
      { userAgent: "DuckAssistBot", ...publicAllow },
    ],
    sitemap: "https://code-up.tech/sitemap.xml",
    host: "https://code-up.tech",
  };
}
