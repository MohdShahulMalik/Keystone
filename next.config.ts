import type { NextConfig } from "next";

/**
 * Baseline security headers for an auth-cookie app. A strict CSP is a
 * follow-up: Next.js needs nonce-based inline scripts wired through the
 * server first, and a broken CSP takes the whole app down.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  // pdf-parse resolves its pdf.js worker via a runtime-relative path
  // ("./pdf.worker.mjs"); bundling it into the server chunks breaks that
  // resolution (prod: "Setting up fake worker failed: Cannot find module").
  // Keep it external so it runs from real node_modules.
  serverExternalPackages: ["pdf-parse"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
