import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
const rootEnv = resolve(__dirname, ".env.local");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
const config: NextConfig = {
  experimental: {
    turbopackFileSystemCacheForDev:
      process.env.NEXT_DISABLE_DEV_CACHE !== "true",
  },
  async headers() {
    const dev = process.env.NODE_ENV !== "production";
    const endpoint = new URL(
      process.env.S3_ENDPOINT || "https://t3.storage.dev",
    );
    const photoOrigins = [
      endpoint.origin,
      `${endpoint.protocol}//${process.env.S3_BUCKET || "receipts"}.${endpoint.host}`,
    ].join(" ");
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${photoOrigins}; font-src 'self'; connect-src 'self'${dev ? " ws: wss:" : ""}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`,
          },
          ...(!dev
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains",
                },
              ]
            : []),
        ],
      },
    ];
  },
};
export default config;
